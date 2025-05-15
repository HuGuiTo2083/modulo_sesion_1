import ssl
import certifi
import wave
import audioop
import random
from dotenv import load_dotenv

# Sobrescribe el contexto HTTPS por defecto para que use el .pem de certifi
def _create_https_context():
    # Crea un nuevo contexto en cada llamada
    return ssl.create_default_context(cafile=certifi.where())

ssl._create_default_https_context = _create_https_context
import json
load_dotenv()

from flask import Flask, render_template, Response, request, send_file, jsonify
import cv2
from pathlib import Path           # para manejar rutas de forma portable

import numpy as np
from flask_socketio import SocketIO, emit

from datetime import datetime  
import base64
import requests
from tempfile import NamedTemporaryFile


from openai import OpenAI
client = OpenAI(api_key=os.getenv("WHISPER_KEY"))  


#import soundfile as sf
import time, threading   
process_audio_lock = threading.Lock() 
#ANALYSIS_PERIOD = 5.0     #---variable para enviar cada 5 segundos un frame a la funcion de IA para Ojos C
import io
from concurrent.futures import ThreadPoolExecutor

# crea un pool global con 1-2 hilos máximo
ai_executor = ThreadPoolExecutor(max_workers=3)
# ─── Evitar errores de symlinks en Windows ────────────────────────────────────
import os, shutil, errno, pathlib
_original_symlink = os.symlink          # ← guardamos la implementación real

def _safe_symlink(src, dst, target_is_directory=False):
    """
    Intenta crear un symlink.  
    Si Windows niega el privilegio (WinError 1314 / errno.EPERM),
    copia el archivo o carpeta en su lugar.
    """
    try:
        _original_symlink(src, dst, target_is_directory=target_is_directory)
    except OSError as e:
        # 1314 = ERROR_PRIVILEGE_NOT_HELD  |  errno.EPERM / EACCES para otras plataformas
        if getattr(e, "winerror", 0) == 1314 or e.errno in (errno.EPERM, errno.EACCES):
            if os.path.isdir(src):
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(src, dst)
        else:
            raise

# Reemplazamos las dos variantes
os.symlink = _safe_symlink
pathlib.Path.symlink_to = lambda self, target, *a, **kw: _safe_symlink(
    target, self, *a, **kw
)
# ──────────────────────────────────────────────────────────────────────────────


import math


#----------------------------------------------

app = Flask(__name__)
app.config['SECRET_KEY'] = 'tu_clave_secreta'  # Cambia esto en producción!



socketio = SocketIO(app, cors_allowed_origins="*")
# justo debajo de `socketio = SocketIO(...)`
log_buffer = []
audio_b_buffer = []
screen_buffer = []
eye_c_buffer = []
audio_a_buffer =[]
audio_samplerates = {}  # { device_index: samplerate }
audio_threads = []                # aquí iremos acumulando cada trozo de audio

monitoring_active = True
stop_event = threading.Event()


# Configuración de captura de pantalla
MONITOR_NUMBER = 1  # Usar sct.monitors para ver opciones
FRAME_RATE = 10     # Cuadros por segundo

# ================================
# 1) Configuración de MediaPipe
# ================================
# mp.solutions.hands es un módulo de MediaPipe especializado en la detección y
# rastreo de manos. Nos provee la clase "Hands" para hacer el análisis.

audio_samplerate = None




def stop_all():
    stop_event.set()
    for t in audio_threads:
        t.join(timeout=5)

def log_event(message):
    print(message)
    # Emite el evento "gesture_event" a todos los clientes conectados
    #socketio.emit("gesture_event", {"message": message})
    log_buffer.append(f"{datetime.now()} --------------\n{message}\n")


ANALYSIS_PERIOD = 60.0  # ahora cada 60 segundos

def gen_frames(frame):
    
    last_ai_ts = 0

        # ————— aquí comprobamos si ya pasó 1 minuto —————
    now = time.time()
    if True:
        last_ai_ts = now
        # 1) Convertir frame a Data URL
        _, jpg_buf = cv2.imencode('.jpg', frame)
        img_b64 = base64.b64encode(jpg_buf).decode('utf-8')
        data_url = f"data:image/jpeg;base64,{img_b64}"
        # 2) Construir prompt y payload (igual que antes)
        SYSTEM_PROMPT = """
        Eres “ExtractorBehavior v1”. Analiza este fotograma de una sesión de trabajo y devuelve
        SOLO un JSON con esta estructura exacta (sin texto adicional):
        {
          "num_personas": int,                    // número de personas detectadas
          "posturas": [str],                      // posturas detectadas (p. ej. “sentado erguido”)
          "gestos": [str],                        // gestos detectados (p. ej. “asentir con la cabeza”)
          "nivel_participacion": "alta"|"media"|"baja",
          "acciones_participacion": [str],        // acciones representativas de participar
          "acciones_no_participacion": [str]      // acciones representativas de no participar
        }
        **Ejemplo de formato (NO INCLUIR estos valores a menos que se detecten):**
        {
          "num_personas": 1,
          "posturas": ["sentado erguido"],
          "gestos": ["asentir con la cabeza"],
          "nivel_participacion": "media",
          "acciones_participacion": [
            "tomar notas",
            "asentir con la cabeza",
            "mirar al ponente",
            "hacer una pregunta en voz baja",
            "sonreír ligeramente"
          ],
          "acciones_no_participacion": [
            "mirar el teléfono",
            "reclinarse hacia atrás",
            "evitar el contacto visual",
            "cruzar los brazos",
            "bostezar"
          ]
        }
        Ahora analiza el fotograma y rellena ese JSON **únicamente** con lo que realmente veas.
        No añadas explicaciones ni ejemplos extra, solo el objeto JSON con los datos detectados.
        """.strip()
        user_message = "Imagen en Base64:\n" + data_url
        payload = {
          "model": "meta-llama/llama-4-maverick:free",
          "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
              "role": "user",
              "content": [
                {"type": "text",      "text": "Analiza esta imagen para comportamiento…"},
                {"type": "image_url",  "image_url": {"url": data_url, "detail": "auto"}}
              ]
            }
          ],
          "temperature": 0.1,
          "max_tokens": 500
        }
        headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": "https://openrouter.ai/api/v1",
        "Content-Type": "application/json"
        }
        try:
            # Paso 3) Llamar a la API de OpenRouter
            resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers=headers,
        json=payload,
        timeout=15
        )
            data = resp.json()
            if "error" in data:
                log_event(f"[IA Comportamiento] Error: {data['error']['message']}")
            elif data.get("choices"):
                content = data["choices"][0]["message"]["content"]
                log_event("[IA Comportamiento] " + content)
            else:
                log_event("[IA Comportamiento] Respuesta inesperada: " + json.dumps(data))
        except Exception as e:
            log_event(f"[IA Comportamiento] Exception: {e}")
        
        analyze_async(frame)
    # ————————————————————————————————————————————————

        




# -------------------------------------------
# 1)  PARÁMETROS (ajústalos a tu gusto)
AI_MAX_W   = 320          # ancho máximo que verá la IA
AI_JPG_Q   = 60           # calidad JPEG 0-100  (60 ≈ 20-40 kB @320×240)
# -------------------------------------------


def analyze_async(frame):
    try:
       
        analyze_with_ai2(frame)          # sigue recibiendo ndarray
    except Exception as e:
        print(f"[AI-ERROR] {e}", flush=True)

# Configuración de OpenRouter (https://openrouter.ai/)
DEEPSEEK_MODEL = "deepseek/deepseek-r1:free"


# Configuración adicional
# Actualiza el diccionario de aplicaciones
PRESENTATION_APPS = {
    'powerpoint': [
        'powerpoint', 
        'ppt', 
        'ppsx', 
        'presentación',
        'presentation',
        'slide show'
    ],
    'libreoffice': [
        'libreoffice writer',  # Agregado a petición
        'libreoffice impress',
        'odp',
        'presentación',
        'slide'
    ],
    'pdf': [
        'adobe reader',
        'foxit',
        'pdf-xchange',
        'visor pdf',
        '.pdf'
    ],
    'canva': [
        'canva',
        'diseño'
    ],
    'web': [
        'google slides',
        'prezi',
        'genially'
    ]
}


# Modifica la función de detección
# NO DETECTA EL PDF DE MICROSOFT EDGE, TENDRÉ QUE AJUSTAR ESO

import requests
import base64
import re


# Configuración de OpenRouter (https://openrouter.ai/)
#OPENROUTER_API_KEY = "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"  # Reemplazar con tu clave
#OPENROUTER_API_KEY = "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"
#OPENROUTER_API_KEY = "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"
#OPENROUTER_API_KEY = "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"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
DEEPSEEK_MODEL = "deepseek/deepseek-r1:free"



import cv2
import base64
import re
import requests
import traceback
import io





def analyze_with_ai(frame):
   

    try:
       
        # Convertir la imagen (frame) a base64 con data URL
        _, buffer = cv2.imencode('.jpg', frame)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        data_url = f"data:image/jpeg;base64,{img_base64}"

        SYSTEM_PROMPT = """
Eres “ExtractorDeck v2”.
Analizas UN frame de pantalla (imagen) y devuelves SOLO un objeto JSON con esta forma:

{
  "tipo_documento":     "diapositiva" | "pdf" | "excel" | "documento" | "imagen" | "otro",
  "titulo":             str | null,
  "subtitulo":          str | null,
  "bullets":            [str],          # máximo 7
  "conceptos_clave":    [str],          # máximo 7
  "frases_cita":        [str],          # citas textuales exactas
  "preguntas":          [str],          # preguntas halladas
  "llamado_accion":     str | null,     # call to action si existe
  "tipo_slide":         "título" | "contenido" | "imagen" | "tabla" | "gráfico" | null,
  "resumen_150":        str,            # ≤150 caracteres
  "personas": [
    {
      "name":           str | null,     # nombre si aparece
      "description":    str             # descripción/rol o apariencia
    }
  ]                   # lista vacía si no hay nadie
}

— Si un campo no aplica, usa null o [] según corresponda.
— No añadas explicaciones ni ningún otro texto: SOLO JSON válido.
"""

        # Construimos el prompt (texto) que quieres analizar
        text_prompt = f"""
          Analiza esta imagen y completa cada clave del esquema JSON 
            indicado por ExtractorDeck v1.
        """

        # Ahora armamos un payload usando "messages" con "text" e "image_url".
        # Supuestamente, el modelo "meta-llama/llama-4-maverick:free" aceptaría imagen_url.
        payload = {
            "model": "meta-llama/llama-4-maverick:free",  # <--- supuesta "Llama 4 Maverick"
            "messages": [
                  {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": text_prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                # "url" supuestamente admite base64
                                # (¡No está garantizado que realmente lo procese!)
                                "url": data_url,
                                "detail": "auto"
                            }
                        }
                    ]
                }
            ],
            "max_tokens": 500,
            "temperature": 0.1
        }

        #print("[DEBUG] Payload que envío a la IA:")
        #print(payload)

        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "HTTP-Referer": "https://openrouter.ai/api/v1",
            "Content-Type": "application/json"
        }

        # Paso 3) Llamar a la API de OpenRouter
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=15
        )

        # Eliminar archivo temporal

        # Procesar respuesta
        if response.status_code == 200:
            data = response.json()
            #print("[DEBUG] response.json() completo:", data)
            # Podríamos analizar "choices", "message", etc.
            if "choices" in data and len(data["choices"]) > 0:
                content = data["choices"][0]["message"]["content"]
                myStr = f"\n------------[Ventana] - {datetime.now()} --------------------\n"
                print(str(myStr))
                #  print(f"Título detectado: {main_title}")
                 # 4.4 Análisis con IA
                screen_buffer.append(myStr + "\n" + content + "\n")
                print("[DEBUG] Respuesta IA:\n", content)
                return content
            else:
                return "Error: no hay 'choices' en la respuesta."
        else:
            return f"Error API: {response.status_code} - {response.text}"

    except Exception as e:
        traceback.print_exc()
        return f"Error análisis IA: {str(e)}"







def analyze_with_ai2(frame):
    """
    1) Convierte el frame a RGB y guarda en ./myTemp (docTR).
    2) Extrae texto con docTR (OCR).
    3) Envía: (a) texto OCR, (b) imagen base64
       al supuesto modelo "meta-llama/llama-4-maverick:free" en OpenRouter.
    4) Retorna la respuesta de la IA (o muestra en consola).
    """

    try:
        print("***** IA 2 ******", flush=True)
       
        # Convertir la imagen (frame) a base64 con data URL
        _, buffer = cv2.imencode('.jpg', frame)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        data_url = f"data:image/jpeg;base64,{img_base64}"
        SYSTEM_SCENE = """
            Eres “SceneContext v1”.
            Analizas un fotograma capturado por cámara y devuelves **EXCLUSIVAMENTE**
            un objeto JSON con la siguiente estructura:
            
            {
              "persona_detectada":   bool,              // ¿hay alguna persona?
              "acciones_persona":    [str],             // verbos como “escribiendo”, “hablando”
              "expresion_facial":    str | null,        // “neutra”, “sonriente”, etc.
              "objetos_relevantes":  [str],             // p.ej. “pizarrón”, “proyector”, “café”
              "entorno":             str,               // 1 frase: aula, oficina, sala, exterior…
              "texto_visible":       [str],             // líneas OCR legibles en la escena
              "pizarra_detectada":   bool,
              "pizarra_texto":       str | null,        // texto/diagramas identificados
              "descripcion_150":     str                // ≤150 caracteres de resumen global
            }
            
            Si no aplica un campo, usa null o [].  
            No añadas explicaciones, solo JSON válido.
            """
        
        # Construimos el prompt (texto) que quieres analizar
        text_prompt = f"""
         Analiza la imagen adjunta. Identifica entorno, objetos, acciones 
            de las personas y, si existe, transcribe lo que se ve en la pizarra.
        """

        # Ahora armamos un payload usando "messages" con "text" e "image_url".
        # Supuestamente, el modelo "meta-llama/llama-4-maverick:free" aceptaría imagen_url.
        payload = {
            "model": "meta-llama/llama-4-maverick:free",  # <--- supuesta "Llama 4 Maverick"
            "messages": [
                   {"role": "system", "content": SYSTEM_SCENE},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": text_prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                # "url" supuestamente admite base64
                                # (¡No está garantizado que realmente lo procese!)
                                "url": data_url,
                                "detail": "auto"
                            }
                        }
                    ]
                }
            ],
            "max_tokens": 500,
            "temperature": 0.1
        }

        #print("[DEBUG] Payload que envío a la IA:")
        #print(payload)

        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "HTTP-Referer": "https://openrouter.ai/api/v1",
            "Content-Type": "application/json"
        }

        messages = payload["messages"]
        #prompt_tokens = count_tokens_for_messages(messages)
        #print(f"[Uso tokens] Prompt: {prompt_tokens}")

        # Paso 3) Llamar a la API de OpenRouter
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=15
        )

        # Eliminar archivo temporal
        #print("[DEBUG] Status code:", response.status_code)
        #print("[DEBUG] Response text:", response.text)
        # Procesar respuesta
        if response.status_code == 200:
            data = response.json()
            #print("[DEBUG] response.json() completo:", data)
            # Podríamos analizar "choices", "message", etc.
            if "choices" in data and len(data["choices"]) > 0:
                content = data["choices"][0]["message"]["content"]
                #response_tokens = len(enc.encode(content))
                #print(f"[Uso tokens] Respuesta: {response_tokens}")
                #print(f"[Uso tokens] Total aprox.: {prompt_tokens + response_tokens}")
                print("[DEBUG] Respuesta IA:\n" +  content, flush=True)
                eye_c_buffer.append("---------------------- \n " + content + "\n")
                return content
            else:
                print("errror 1--------")
                return "Error: no hay 'choices' en la respuesta."
        else:
            print(f"errror 2--------{response.status_code} - {response.text}")

            return f"Error API: {response.status_code} - {response.text}"

    except Exception as e:
        traceback.print_exc()
        return f"Error análisis IA: {str(e)}"






@app.route('/')
def index():
    """
    Simplemente renderiza la plantilla "index.html" que contendrá
    un <img> apuntando al stream de /video_feed
    """
    return render_template('index.html')



@app.route('/download_log')
def download_log():
    # Unir todos los mensajes
    content = ''.join(log_buffer)
    # Forzar descarga con encabezado Content-Disposition
    return Response(
        content,
        mimetype='text/plain',
        headers={
            'Content-Disposition': 'attachment; filename=A_Eye.txt'
        }
    )
    
@app.route('/download_screen')
def download_screen():
    # Unir todos los mensajes
    content2 = ''.join(screen_buffer)
    # Forzar descarga con encabezado Content-Disposition
    return Response(
        content2,
        mimetype='text/plain',
        headers={
            'Content-Disposition': 'attachment; filename=B_Eye.txt'
        }
    )


    
    
    
    
@app.route('/download_audio_b')
def download_audio_b():
    # Unir todos los mensajes
    content = ''.join([json.dumps(item, ensure_ascii=False) for item in audio_b_buffer])
    # Forzar descarga con encabezado Content-Disposition
    return Response(
        content,
        mimetype='text/plain',
        headers={
            'Content-Disposition': 'attachment; filename=B_Ear.txt'
        }
    )


    
    
@app.route('/download_eye_c')
def download_eye_c():
    # Unir todos los mensajes
    content = ''.join(eye_c_buffer)
    # Forzar descarga con encabezado Content-Disposition
    return Response(
        content,
        mimetype='text/plain',
        headers={
            'Content-Disposition': 'attachment; filename=C_Eye.txt'
        }
    )


















@app.route('/process_audio', methods=['POST'])
def process_audio():
    if not process_audio_lock.acquire(blocking=False):
        return jsonify({"error": "Procesamiento en curso, inténtalo de nuevo más tarde"}), 429

    try:
        # 1) Verificar si se ha recibido el archivo de audio
        audio_file = request.files.get("audio")
        if not audio_file:
            return jsonify({"error": "No se recibió ningún archivo de audio"}), 400

        # Leer los bytes (no se usan para procesamiento real en esta versión)
        _ = audio_file.read()

        # 2) Generar aleatoriamente entre 0 y 4 hablantes
        num_speakers = random.randint(0, 4)
        speakers = []
        for i in range(num_speakers):
            start = round(random.uniform(0, 5), 3)
            end = round(random.uniform(start, start + 5), 3)
            speakers.append({
                "start": start,
                "end": end,
                "speaker": f"speaker_{i}"
            })

        # 3) Generar aleatoriamente al menos 4 emociones distintas
        posibles_emociones = ["happy", "sad", "neutral", "angry", "fear", "surprise", "disgust", "calm"]
        seleccionadas = random.sample(posibles_emociones, 4)
        hf_preds = [
            {"label": emo, "score": round(random.uniform(0, 1), 3)}
            for emo in seleccionadas
        ]

        # 4) Guardar la información generada en el buffer
        audio_b_buffer.append({
            "timestamp": str(datetime.now()),
            "speakers": speakers,
            "emotions": hf_preds,
        })

        # 5) Devolver la respuesta con los datos aleatorios
        return jsonify({"speakers": speakers, "emotions": hf_preds})

    except Exception as e:
        app.logger.error(f"Error en proceso audio: {e}")
        return jsonify({"error": str(e)}), 500

    finally:
        process_audio_lock.release()



@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    audio_file = request.files.get('audio')
    if not audio_file:
        return jsonify({"error": "No se recibió ningún archivo 'audio'"}), 400

    # Leer datos del archivo en memoria
    input_bytes = audio_file.read()

    # Función para reducir el tamaño del WAV en memoria
    def reduce_wav_size_bytes(input_bytes: bytes, target_rate: int = 13000, target_swidth: int = 2) -> bytes:
        with wave.open(io.BytesIO(input_bytes), 'rb') as wf:
            nchan, swidth, rate, nframes, comptype, compname = wf.getparams()
            audio_data = wf.readframes(nframes)

        # Convertir a mono si es necesario
        if nchan > 1:
            audio_data = audioop.tomono(audio_data, swidth, 1, 1)
            nchan = 1

        # Cambiar a 8 bits si es necesario
        if swidth != target_swidth:
            audio_data = audioop.lin2lin(audio_data, swidth, target_swidth)
            swidth = target_swidth

        # Cambiar la frecuencia de muestreo si es necesario
        if rate != target_rate:
            audio_data, _ = audioop.ratecv(audio_data, swidth, nchan, rate, target_rate, None)
            rate = target_rate

        # Escribir el WAV reducido en un buffer
        out_buffer = io.BytesIO()
        with wave.open(out_buffer, 'wb') as wf_out:
            wf_out.setnchannels(nchan)
            wf_out.setsampwidth(swidth)
            wf_out.setframerate(rate)
            wf_out.writeframes(audio_data)
        return out_buffer.getvalue()

    try:
        # Reducir el tamaño en memoria
        reduced_bytes = reduce_wav_size_bytes(input_bytes)

        # Enviar a Whisper para transcripción
        with io.BytesIO(reduced_bytes) as f:
            resp = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                language="es",
                response_format="json"  # evitamos el bug
            )

        text = resp["text"] if isinstance(resp, dict) else resp.text
        audio_a_buffer.append(text)

        return jsonify({"transcription": text})

    except Exception as e:
        app.logger.error(f"Error en Whisper: {e}")
        return jsonify({"error": str(e)}), 500





@app.route('/analyze_buffers', methods=['POST'])
def analyze_buffers():
    """
    Toma el contenido de los 4 buffers, los envía a OpenRouter
    usando el modelo Gemini y devuelve el análisis.
    """
    # 1) Combinar todo en un solo prompt
    prompt = (
        "Por favor analiza estos cuatro Logs y dame un informe detallado, encuentra eventos en comun y contextualiza todos en un informe único, se creativo y convierte todo esto en algo útil y usable:\n\n"
        f"Log de registros de gestos detectados:\n{''.join(log_buffer)}\n\n"
        "-------------------------------------------"
        f"Log de contenido de presentaciones de diapositivas detectadas:\n{''.join(screen_buffer)}\n\n"
        "----------------------------------------------"
        f"Transcripcion de la Sesión:\n{''.join(audio_a_buffer)}\n\n"
        "----------------------------------------------"
        f"Log de Descripciones de Luga:\n{''.join(eye_c_buffer)}\n\n"
        "----------------------------------------------"
        f"Log de emociones y hablantes detectados en fragmentos de videos:\n{''.join(audio_b_buffer)}"
    )

    # 2) Construir el payload para OpenRouter
    payload = {
        "model": "qwen/qwen3-30b-a3b:free",            # reemplaza con el ID correcto si es distinto
        "messages": [
            {"role": "system", "content": "Eres un asistente experto en análisis de datos."},
            {"role": "user",   "content": prompt}
        ],
        "temperature": 0.2
    }

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        # 3) Llamada a la API de OpenRouter
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=30
                 )
        resp.raise_for_status()
        data = resp.json()

        # 4) Extraer la respuesta del asistente
        analysis = data["choices"][0]["message"]["content"]

        return jsonify({
            "analysis": analysis,
            "raw": data
        })

    except requests.RequestException as e:
        app.logger.error(f"OpenRouter error: {e}")
        return jsonify({"error": str(e)}), 502

    except (KeyError, IndexError):
        return jsonify({"error": "Respuesta inesperada de OpenRouter", "raw": resp.text}), 502




def base64_to_frame(base64_str):
    # Quitar prefijo data URL (ej. "data:image/png;base64,")
    img_str = re.sub('^data:image/.+;base64,', '', base64_str)
    # Decodificar base64 a bytes
    img_bytes = base64.b64decode(img_str)
    # Convertir bytes a numpy array 1D de tipo uint8
    nparr = np.frombuffer(img_bytes, np.uint8)
    # Decodificar numpy array en imagen OpenCV (BGR)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return frame


@app.route('/upload_frame', methods=['POST'])
def upload_frame():
    data = request.get_json()
    image_data = data.get('image', '')

    # Convertir base64 a frame numpy
    frame = base64_to_frame(image_data)

    if frame is None:
        return jsonify({'status': 'error', 'message': 'Imagen no válida'}), 400

    # Llamar a la función de análisis AI con el frame
    ai_result = analyze_with_ai(frame)

    return jsonify({'status': 'success', 'result': ai_result}), 200




@app.route('/upload_frame2', methods=['POST'])
def upload_frame2():
    data = request.get_json()
    image_data = data.get('image')

    if not image_data:
        return jsonify({'status': 'error', 'message': 'Falta la imagen'}), 400

    frame = base64_to_frame(image_data)
    gen_frames(frame)
    return {"message": "hola"}
    


# if __name__ == '__main__':
#     #start_audio_recording()
#     socketio.run(app,
#                  debug=True,
#                  use_reloader=False,    # <— aquí
#                  host='0.0.0.0',
#                  port=5000)

    
