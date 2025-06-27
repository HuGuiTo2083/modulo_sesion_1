import ssl
import certifi
import wave
import audioop
import random
from dotenv import load_dotenv
import os
import httplib2


#hola
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

from datetime import datetime  
import base64
import requests
from tempfile import NamedTemporaryFile

from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from google_auth_httplib2 import AuthorizedHttp     
from google.oauth2 import service_account

from openai import OpenAI
client = OpenAI(api_key=os.getenv("WHISPER_KEY"))  

# Configuración desde .env
SCOPES = ['https://www.googleapis.com/auth/drive.file']
SERVICE_ACCOUNT_FILE = os.getenv('GOOGLE_CREDENTIALS_FILE', './credenciales.json')
FOLDER_ID = os.getenv('GOOGLE_DRIVE_FOLDER_ID')

def _sa_info_from_env() -> dict:
    """Construye el dict con los campos esenciales de la service account."""
    return {
        "type":         os.environ["SA_TYPE"],
        "project_id":   os.environ["SA_PROJECT_ID"],
        "private_key_id": os.environ["SA_PRIVATE_KEY_ID"],
        # Convierte '\n' literales a saltos reales
        "private_key":  os.environ["SA_PRIVATE_KEY"].replace("\\n", "\n"),
        "client_email": os.environ["SA_CLIENT_EMAIL"],
        "token_uri":    os.environ["SA_TOKEN_URI"],
    }


#import soundfile as sf
import time, threading   
process_audio_lock = threading.Lock() 
#ANALYSIS_PERIOD = 5.0     #---variable para enviar cada 5 segundos un frame a la funcion de IA para Ojos C
import io
from concurrent.futures import ThreadPoolExecutor

# crea un pool global con 1-2 hilos máximo
ai_executor = ThreadPoolExecutor(max_workers=3)
# ─── Evitar errores de symlinks en Windows ────────────────────────────────────
import shutil, errno, pathlib
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


# -------------------------AQUI ES LA PARTE PARA SUBIR A GOOGLE DRIVE----

def get_drive_service():
    """
    Crea un servicio de Google Drive usando la service-account de variables
    de entorno y DESACTIVANDO la verificación del certificado SSL.
    ⚠️  Úsalo solo en entorno de pruebas: deja la conexión vulnerable a MITM.
    """
    print("\n===== Intentando crear servicio con variables de entorno =====")
    try:
        # 1) Reconstruir el dict de la service-account
        print("Reconstruyendo credenciales desde variables...")
        info = _sa_info_from_env()

        # 2) Objeto Credentials
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=SCOPES
        )
        print("✔️  Credenciales cargadas.")

        # 3) Cliente HTTP con verificación TLS deshabilitada
        raw_http = httplib2.Http(
            disable_ssl_certificate_validation=True,  # 👈 desactiva verificación
            timeout=60,
            cache=None
        )
        authed_http = AuthorizedHttp(credentials, http=raw_http)
        print("HTTP autorizado (verificación TLS desactivada).")

        # 4) Construir el servicio Drive
        service = build(
            "drive", "v3",
            http=authed_http,
            cache_discovery=False
        )
        print("✅ Servicio de Drive creado exitosamente")
        return service

    except Exception as e:
        print(f"❌ Error al crear servicio de Drive: {e}")
        traceback.print_exc()
        return None


def upload_single_file_to_drive(file_content, filename, folder_id=None):
    """
    Subir un solo archivo a Google Drive
    """
    print(f"\n--- Iniciando subida de archivo: {filename} ---")
    print(f"Tamaño del contenido: {len(file_content)} bytes")
    print(f"Folder destino: {folder_id or 'Raíz de Drive'}")
    
    try:
        service = get_drive_service()
        if not service:
            print("⚠️ Abortando subida por falta de servicio")
            return {'success': False, 'error': 'No se pudo conectar con Google Drive'}
        
        # Crear el archivo en memoria
        file_stream = io.BytesIO(file_content.encode('utf-8'))
        
        # Metadatos del archivo
        file_metadata = {'name': filename, 'mimeType': 'text/plain'}
        if folder_id:
            file_metadata['parents'] = [folder_id]
        
        # Subir el archivo
        print(f"Subiendo '{filename}'...")
        media = MediaIoBaseUpload(file_stream, mimetype='text/plain', resumable=True)
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id,name,webViewLink,size'
        ).execute()
        
        print(f"✅ Archivo subido exitosamente! ID: {file.get('id')}")
        print(f"Enlace: {file.get('webViewLink')}")
        print(f"Tamaño: {file.get('size', 'N/A')} bytes")
        
        return {
            'success': True,
            'file_id': file.get('id'),
            'file_name': file.get('name'),
            'web_link': file.get('webViewLink'),
            'size': file.get('size', 'N/A')
        }
        
    except Exception as e:
        print(f"❌ Error durante la subida de '{filename}': {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }



@app.route('/upload-multiple-files', methods=['POST'])
def upload_multiple_files():
    """
    Endpoint para subir múltiples archivos a Google Drive
    """
    print("\n" + "="*50)
    print("📬 RECIBIDA SOLICITUD DE SUBIDA MULTIPLE")
    print("="*50)
    
    try:
        data = request.get_json()
        print(f"Datos recibidos: {data.keys() if data else 'Sin datos'}")
        
        # Validar estructura básica
        if not data or 'files' not in data:
            print("❌ Formato inválido: Falta campo 'files'")
            return jsonify({
                'success': False,
                'error': 'Formato inválido. Se requiere un objeto con array "files"'
            }), 400
        
        files_data = data.get('files', [])
        folder_id = data.get('folder_id', FOLDER_ID)
        
        print(f"Total de archivos recibidos: {len(files_data)}")
        print(f"Folder ID a usar: {folder_id}")
        
        if not files_data:
            print("❌ No se enviaron archivos en el array")
            return jsonify({
                'success': False,
                'error': 'No se proporcionaron archivos'
            }), 400
        
        if len(files_data) > 10:
            print(f"❌ Demasiados archivos ({len(files_data)} > 10 permitidos)")
            return jsonify({
                'success': False,
                'error': 'Máximo 10 archivos por request'
            }), 400
        
        # Procesar cada archivo
        results = []
        successful_uploads = 0
        failed_uploads = 0
        
        print("\nIniciando procesamiento de archivos...")
        for idx, file_data in enumerate(files_data):
            filename = file_data.get('filename', f'archivo_{idx+1}.txt')
            content = file_data.get('content', '')
            
            print(f"\n📄 Procesando archivo {idx+1}/{len(files_data)}: {filename}")
            
            # if not content:
            #     error_msg = "Contenido vacío"
            #     print(f"⚠️ {error_msg}")
            #     results.append({'filename': filename, 'success': False, 'error': error_msg})
            #     failed_uploads += 1
            #     continue
            
            result = upload_single_file_to_drive(content, filename, folder_id)
            
            if result['success']:
                print(f"👍 {filename} - SUBIDA EXITOSA")
                results.append({
                    'filename': filename,
                    'success': True,
                    'file_id': result['file_id'],
                    'web_link': result['web_link'],
                    'size': result['size']
                })
                successful_uploads += 1
            else:
                print(f"👎 {filename} - FALLÓ: {result['error']}")
                results.append({
                    'filename': filename,
                    'success': False,
                    'error': result['error']
                })
                failed_uploads += 1
        
        # Resumen final
        print("\n" + "="*50)
        print("📊 RESUMEN FINAL DE SUBIDA")
        print(f"TOTAL ARCHIVOS: {len(files_data)}")
        print(f"EXITOSOS: {successful_uploads}")
        print(f"FALLIDOS: {failed_uploads}")
        print("="*50)
        
        return jsonify({
            'success': successful_uploads > 0,
            'summary': {
                'total_files': len(files_data),
                'successful': successful_uploads,
                'failed': failed_uploads
            },
            'results': results,
            'folder_link': f"https://drive.google.com/drive/folders/{folder_id}" if folder_id else None
        })
        
    except Exception as e:
        print(f"\n🔥 ERROR INESPERADO EN ENDPOINT: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Error interno del servidor: {str(e)}'
        }), 500



@app.route('/upload-audio-file', methods=['POST'])
def upload_audio_file():
    """
    Endpoint para subir archivo de audio (WAV, MP3, etc.) a Google Drive
    Usa método híbrido para máxima confiabilidad
    """
    print("\n" + "="*50)
    print("🎵 RECIBIDA SOLICITUD DE SUBIDA DE AUDIO")
    print("="*50)
    
    try:
        # Verificar que se envió un archivo
        if 'audio' not in request.files:
            print("❌ No se encontró campo 'audio' en los archivos")
            return jsonify({
                'success': False,
                'error': 'No se proporcionó archivo de audio'
            }), 400
        
        audio_file = request.files['audio']
        timestamp = request.form.get('timestamp', '')
        
        # Verificar que el archivo no esté vacío
        if audio_file.filename == '':
            print("❌ Nombre de archivo vacío")
            return jsonify({
                'success': False,
                'error': 'Archivo de audio vacío'
            }), 400
        
        filename = audio_file.filename
        print(f"📁 Archivo recibido: {filename}")
        print(f"⏰ Timestamp: {timestamp}")
        
        # Obtener el contenido del archivo
        audio_content = audio_file.read()
        file_size = len(audio_content)
        
        print(f"📏 Tamaño del archivo: {file_size} bytes ({file_size / (1024*1024):.2f} MB)")
        
        if file_size == 0:
            print("❌ Archivo vacío")
            return jsonify({
                'success': False,
                'error': 'El archivo de audio está vacío'
            }), 400
        
        # Determinar folder_id
        folder_id = FOLDER_ID
        print(f"📂 Subiendo a folder ID: {folder_id}")
        
        # USAR EL MÉTODO HÍBRIDO para máxima confiabilidad
        result = upload_audio_file_to_drive(audio_content, filename, folder_id)
        
        if result['success']:
            print(f"✅ {filename} - SUBIDA EXITOSA")
            print(f"🔗 File ID: {result['file_id']}")
            
            return jsonify({
                'success': True,
                'filename': filename,
                'file_id': result['file_id'],
                'web_link': result['web_link'],
                'size': result['size'],
                'message': 'Archivo de audio subido exitosamente',
                'folder_link': f"https://drive.google.com/drive/folders/{folder_id}",
                'upload_method': 'hybrid'
            })
        else:
            print(f"❌ {filename} - FALLÓ: {result['error']}")
            return jsonify({
                'success': False,
                'error': result['error']
            }), 500
        
    except Exception as e:
        print(f"\n🔥 ERROR INESPERADO EN SUBIDA DE AUDIO: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Error interno del servidor: {str(e)}'
        }), 500

def upload_audio_file_to_drive(audio_content, filename, folder_id=None):
    """
    Función para subir archivo de audio a Google Drive
    Versión corregida para evitar errores de redirección
    """
    print(f"\n--- Iniciando subida de archivo de audio: {filename} ---")
    print(f"Tamaño del contenido: {len(audio_content)} bytes")
    print(f"Folder destino: {folder_id or 'Raíz de Drive'}")
    
    try:
        
        # Usar la misma función de servicio que upload_single_file_to_drive
        service = get_drive_service()
        if not service:
            print("⚠️ Abortando subida por falta de servicio")
            return {'success': False, 'error': 'No se pudo conectar con Google Drive'}
        
        # Determinar el MIME type basado en la extensión
        file_extension = filename.lower().split('.')[-1] if '.' in filename else ''
        mime_types = {
            'wav': 'audio/wav',
            'mp3': 'audio/mpeg',
            'mp4': 'audio/mp4',
            'm4a': 'audio/mp4',
            'ogg': 'audio/ogg',
            'flac': 'audio/flac',
            'aac': 'audio/aac'
        }
        mime_type = mime_types.get(file_extension, 'audio/wav')
        
        print(f"🎵 MIME type detectado: {mime_type}")
        
        # Crear el archivo en memoria
        file_stream = io.BytesIO(audio_content)
        
        # Metadatos del archivo (sin especificar mimeType en metadata)
        file_metadata = {'name': filename}
        if folder_id:
            file_metadata['parents'] = [folder_id]
        
        print(f"Subiendo '{filename}'...")
        
        # OPCIÓN 1: Upload simple sin resumable para archivos pequeños
        if len(audio_content) < 5 * 1024 * 1024:  # Menos de 5MB
            print("📤 Usando upload simple (archivo pequeño)")
            media = MediaIoBaseUpload(
                file_stream, 
                mimetype=mime_type,
                resumable=False  # Cambiar a False para archivos pequeños
            )
        else:
            # OPCIÓN 2: Upload resumable para archivos grandes
            print("📤 Usando upload resumable (archivo grande)")
            media = MediaIoBaseUpload(
                file_stream, 
                mimetype=mime_type,
                chunksize=262144,  # 256KB chunks (más pequeños)
                resumable=True
            )
        
        # Intentar subida con reintentos
        max_retries = 5
        for attempt in range(max_retries):
            try:
                print(f"Intento {attempt + 1}/{max_retries}")
                
                file = service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields='id,name,webViewLink,size'
                ).execute()
                
                print(f"✅ Archivo de audio subido exitosamente! ID: {file.get('id')}")
                print(f"Enlace: {file.get('webViewLink')}")
                print(f"Tamaño: {file.get('size', 'N/A')} bytes")
                
                return {
                    'success': True,
                    'file_id': file.get('id'),
                    'file_name': file.get('name'),
                    'web_link': file.get('webViewLink'),
                    'size': file.get('size', 'N/A')
                }
                
            except Exception as retry_error:
                print(f"❌ Intento {attempt + 1} falló: {str(retry_error)}")
                if attempt == max_retries - 1:
                    raise retry_error
                
                # Resetear el stream para el siguiente intento
                file_stream.seek(0)
                
                # Esperar un poco antes del siguiente intento
                import time
                time.sleep(1)
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error durante la subida de '{filename}': {error_msg}")
        
        # Mensaje más específico para el error de redirección
        if "Redirected" in error_msg and "Location" in error_msg:
            print("💡 Sugerencia: Este error puede deberse a:")
            print("   - Token de autenticación expirado")
            print("   - Permisos insuficientes")
            print("   - Problema temporal con Google Drive API")
            print("   - Archivo demasiado grande para upload simple")
        
        return {
            'success': False,
            'error': error_msg
        }


# FUNCIÓN ALTERNATIVA: Usando requests directamente
def upload_audio_file_to_drive_alternative(audio_content, filename, folder_id=None):
    """
    Función alternativa usando requests directamente
    Para casos donde googleapiclient tiene problemas
    """
    try:
        import requests
        from google.auth.transport.requests import Request
        
        print(f"\n--- Upload alternativo de audio: {filename} ---")
        
        # Obtener credenciales
        service = get_drive_service()
        if not service:
            return {'success': False, 'error': 'No se pudo conectar con Google Drive'}
        
        # Obtener token de acceso
        credentials = service._http.credentials
        if credentials.expired:
            credentials.refresh(Request())
        
        access_token = credentials.token
        
        # Determinar MIME type
        file_extension = filename.lower().split('.')[-1] if '.' in filename else ''
        mime_types = {
            'wav': 'audio/wav', 'mp3': 'audio/mpeg', 'mp4': 'audio/mp4',
            'm4a': 'audio/mp4', 'ogg': 'audio/ogg', 'flac': 'audio/flac', 'aac': 'audio/aac'
        }
        mime_type = mime_types.get(file_extension, 'audio/wav')
        
        # Metadatos
        metadata = {'name': filename}
        if folder_id:
            metadata['parents'] = [folder_id]
        
        # Headers
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        # Crear archivo primero (sin contenido)
        create_url = 'https://www.googleapis.com/drive/v3/files'
        response = requests.post(create_url, headers=headers, json=metadata)
        
        if response.status_code != 200:
            raise Exception(f"Error creando archivo: {response.text}")
        
        file_data = response.json()
        file_id = file_data['id']
        
        # Subir contenido
        upload_url = f'https://www.googleapis.com/upload/drive/v3/files/{file_id}?uploadType=media'
        upload_headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': mime_type
        }
        
        upload_response = requests.patch(upload_url, headers=upload_headers, data=audio_content)
        
        if upload_response.status_code not in [200, 201]:
            raise Exception(f"Error subiendo contenido: {upload_response.text}")
        
        # Obtener información final del archivo
        get_url = f'https://www.googleapis.com/drive/v3/files/{file_id}?fields=id,name,size,webViewLink'
        final_response = requests.get(get_url, headers={'Authorization': f'Bearer {access_token}'})
        final_data = final_response.json()
        
        print(f"✅ Upload alternativo exitoso! ID: {file_id}")
        
        return {
            'success': True,
            'file_id': file_id,
            'file_name': final_data.get('name'),
            'web_link': final_data.get('webViewLink'),
            'size': final_data.get('size', len(audio_content))
        }
        
    except Exception as e:
        print(f"❌ Error en upload alternativo: {str(e)}")
        return {'success': False, 'error': str(e)}

# -------------------------------------------------------------------------------

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
OPENROUTER_API_KEY_2 = os.getenv("OPENROUTER_API_KEY_2")

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




def analyze_with_ai3(frame):
   

    try:
       
        # Convertir la imagen (frame) a base64 con data URL
        _, buffer = cv2.imencode('.jpg', frame)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        data_url = f"data:image/jpeg;base64,{img_base64}"

        SYSTEM_PROMPT = """


Eres un asistente especializado en análisis de contenido visual de pantallas compartidas. Tu objetivo es identificar y extraer la información más relevante y importante de cualquier imagen de pantalla que recibas.

## Instrucciones Principales:

### 1. IDENTIFICACIÓN DE CONTEXTO
- Determina inmediatamente el tipo de aplicación o contenido mostrado (documento, presentación, hoja de cálculo, navegador web, aplicación específica, etc.)
- Identifica el propósito aparente de lo que se está visualizando

### 2. EXTRACCIÓN DE INFORMACIÓN CLAVE
Enfócate en extraer:
- **Títulos principales** y encabezados más importantes
- **Datos numéricos críticos** (fechas, cifras, porcentajes, métricas)
- **Puntos clave** o información destacada
- **Conclusiones** o insights principales
- **Acciones** o tareas pendientes visibles
- **Nombres** de personas, empresas, o proyectos relevantes

### 3. PRIORIZACIÓN DE RELEVANCIA
Ordena la información por importancia:
1. Información que parece ser el foco principal de la pantalla
2. Datos numéricos o métricas destacadas
3. Fechas límite o información temporal crítica
4. Contexto de apoyo que ayuda a entender el contenido principal

### 4. TIPOS DE CONTENIDO A ANALIZAR

**Documentos/Presentaciones:**
- Título del documento
- Puntos principales de cada diapositiva visible
- Gráficos o datos importantes
- Conclusiones o recomendaciones

**Hojas de Cálculo:**
- Títulos de tablas o reportes
- Cifras más prominentes
- Totales, subtotales, o cálculos importantes
- Tendencias visibles en los datos

**Navegadores Web:**
- Título de la página web
- Información principal del sitio
- Datos relevantes mostrados
- Formularios o interfaces importantes

**Aplicaciones de Trabajo:**
- Nombre del proyecto o tarea
- Estados o progreso visible
- Fechas importantes
- Asignaciones o responsables

### 5. FORMATO DE RESPUESTA
Estructura tu respuesta así:

**CONTEXTO:** [Tipo de aplicación/documento]
**TEMA PRINCIPAL:** [De qué trata principalmente]
**INFORMACIÓN CLAVE:**
- [Punto más importante]
- [Segundo punto más importante]
- [Datos numéricos relevantes]
- [Fechas o plazos críticos]

**RESUMEN:** [Una oración que capture la esencia de lo mostrado]

### 6. CONSIDERACIONES ESPECIALES
- Si hay múltiples ventanas abiertas, enfócate en la que parece más activa o prominente
- Para gráficos o charts, describe las tendencias principales
- Si hay texto pequeño o difícil de leer, enfócate en los elementos más visibles
- Mantén un tono profesional y conciso
- No inventes información que no puedas ver claramente

### 7. CASOS ESPECIALES
- **Pantalla de login/inicio:** Identifica la aplicación o servicio
- **Código/programación:** Enfócate en comentarios, nombres de funciones principales, o propósito del código
- **Videollamadas:** Describe el contexto de la reunión si es visible
- **Múltiples aplicaciones:** Prioriza la ventana más grande o activa

Recuerda: Tu objetivo es ser los "ojos inteligentes" del usuario, capturando rápidamente lo más importante de su pantalla para generar contexto valioso.
"""

        # Construimos el prompt (texto) que quieres analizar
        text_prompt = f"""
          Analiza esta imagen y completa el analisis en el formato que se te indicó.
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
            "Authorization": f"Bearer {OPENROUTER_API_KEY_2}",
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



def analyze_resume(info, checklist):
   

    try:
       
       
        myInfo = info
        SYSTEM_PROMPT = """
Eres un asistente especializado en seguimiento de reuniones.  
Se te proporcionarán dos bloques de información:

1. **Checklist inicial** ─ lista numerada de puntos, tareas o compromisos acordados al inicio de la sesión.  
2. **Registro de la sesión** ─ transcripción, minutas o notas donde se describe lo tratado durante la reunión.

**TAREA PRINCIPAL**  
Compara cada ítem del Checklist inicial contra la información del Registro de la sesión y determina su estado:

- **Cumplido**: el registro indica claramente que el punto se completó, cerró o quedó resuelto.  
- **Pendiente**: no hay evidencia suficiente de cumplimiento en el registro.

**SALIDA REQUERIDA**  
Devuelve **solo** los ítems pendientes en el mismo orden en que aparecen en el Checklist inicial.

**FORMATO ESTRICTO (HTML)**  
- Devuelve **exclusivamente** código HTML válido.  
- Encabezado obligatorio: `<p><strong>Puntos faltantes:</strong></p>` (sin texto adicional).  
- A continuación, presenta los ítems pendientes dentro de una lista sin ordenar `<ul>`; cada punto debe ir en su propio `<li>`.  
- Mantén la redacción original de cada ítem (puedes acortarla si es excesivamente larga, conservando la esencia).  
- No incluyas comentarios, `<!DOCTYPE>`, encabezados de nivel `<h1>–<h6>`, marcas de tiempo ni conclusiones extra.

**EJEMPLO DE SALIDA**

```html
<p><strong>Puntos faltantes:</strong></p>
<ul>
  <li>Actualizar parámetros de soplado y validar con 3 lotes piloto</li>
  <li>Certificar segunda fuente de resina PET-HF</li>
  <li>Integrar visión artificial 360° en la celda de inspección</li>
</ul>
"""



        # Construimos el prompt (texto) que quieres analizar
        text_prompt = f"""
          Analiza esta informacion y completa el analisis en el formato que se te indicó. informacion de sesion hasta ahora: {myInfo} , checklist: {checklist}
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
            "Authorization": f"Bearer {OPENROUTER_API_KEY_2}",
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
                # myStr = f"\n------------[Ventana] - {datetime.now()} --------------------\n"
                # print(str(myStr))
                #  print(f"Título detectado: {main_title}")
                 # 4.4 Análisis con IA
                
                print("*****************************[DEBUG] Respuesta Final de Resumen:\n", content)
                return content
            else:
                return "Error: no hay 'choices' en la respuesta."
        else:
            return f"Error API: {response.status_code} - {response.text}"

    except Exception as e:
        traceback.print_exc()
        return f"Error análisis IA: {str(e)}"




def get_checklist(info):
   

    try:
       
       
        myInfo = info
        SYSTEM_PROMPT = """
Eres un asistente experto en gestión de la calidad y facilitación de reuniones. Se te proporcionará una Ficha Contextual con información detallada de la empresa, el proceso de calidad a revisar y los objetivos de la sesión.

Tarea principal: A partir exclusivamente de los datos que aparezcan en la ficha contextual, elabora una Agenda de Reunión numerada en orden secuencial (1, 2, 3, …) sin omitir ni reordenar números.

Contenido de cada punto:
- Título del punto — breve (máx. 10 palabras)
- Objetivo del punto — una frase concisa que explique por qué se incluye

Restricciones y estilo:
- Usa únicamente la información de la ficha contextual; no inventes datos.
- Respeta la terminología exactamente como aparezca.
- Sé claro, ordenado y profesional; no agregues explicaciones fuera de la agenda.

Formato de salida requerido:
- Devuelve exclusivamente código HTML válido.
- Estructura la agenda en una lista ordenada (<ol>). Cada ítem (<li>) debe contener los dos elementos descritos, presentados en líneas separadas mediante etiquetas <br>.
- El “Título” deberá ir en negritas utilizando <strong>.
- Incluye un <br> adicional al final de cada <li> para una mejor separación visual.
- No añadas encabezados, comentarios, DOCTYPE ni texto fuera de las etiquetas HTML.
"""




        # Construimos el prompt (texto) que quieres analizar
        text_prompt = f"""
          Analiza esta informacion y completa el analisis en el formato que se te indicó. informacion: {myInfo}
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
            "Authorization": f"Bearer {OPENROUTER_API_KEY_2}",
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
                # myStr = f"\n------------[Ventana] - {datetime.now()} --------------------\n"
                # print(str(myStr))
                #  print(f"Título detectado: {main_title}")
                 # 4.4 Análisis con IA
                
                print("*****************************[DEBUG] Respuesta Final de Resumen:\n", content)
                return content
            else:
                return "Error: no hay 'choices' en la respuesta."
        else:
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


    
    
    

# OPCIÓN 1: JSON formateado con separadores claros
@app.route('/download_audio_b')
def download_audio_b():
    # Crear contenido con formato JSON legible
    formatted_content = []
    
    # Agregar encabezado
    formatted_content.append("=" * 60)
    formatted_content.append("REPORTE DE ANÁLISIS DE AUDIO - B_EAR")
    formatted_content.append("=" * 60)
    formatted_content.append(f"Generado: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    formatted_content.append(f"Total de procesamientos: {len(audio_b_buffer)}")
    formatted_content.append("=" * 60)
    formatted_content.append("")
    
    # Agregar cada elemento del buffer con formato
    for i, item in enumerate(audio_b_buffer, 1):
        formatted_content.append(f"--- PROCESAMIENTO #{i} ---")
        formatted_content.append(json.dumps(item, ensure_ascii=False, indent=2))
        formatted_content.append("-" * 40)
        formatted_content.append("")
    
    # Unir todo con saltos de línea
    content = '\n'.join(formatted_content)
    
    return Response(
        content,
        mimetype='text/plain',
        headers={
            'Content-Disposition': 'attachment; filename=B_Ear_Formatted.txt'
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
        
        # 4) Guardar la información generada en el buffer con mejor formato
        audio_data = {
            "id": len(audio_b_buffer) + 1,  # ID secuencial para identificar cada procesamiento
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),  # Formato más legible
            "audio_info": {
                "filename": audio_file.filename if audio_file.filename else "unknown",
                "content_type": audio_file.content_type if audio_file.content_type else "unknown"
            },
            "analysis_results": {
                "speakers": {
                    "count": num_speakers,
                    "details": speakers
                },
                "emotions": {
                    "detected_count": len(hf_preds),
                    "predictions": hf_preds
                }
            }
        }
        
        audio_b_buffer.append(audio_data)


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
        buf = io.BytesIO(reduced_bytes)
        buf.name = audio_file.filename or "audio.wav"   # ← aquí
        resp = client.audio.transcriptions.create(
        model="whisper-1",
        file=buf,
        language="es",
        response_format="json"
    )

        text = resp["text"] if isinstance(resp, dict) else resp.text
        audio_a_buffer.append(text)

        return jsonify({"transcription": text})

    except Exception as e:
        app.logger.error(f"Error en Whisper: {e}")
        return jsonify({"error": str(e)}), 500

myChecklist = ''
    

myIndex_Resume = 0
myBufferImportant = []
@app.route('/resume', methods=['POST'])
def resume_important():
    global myIndex_Resume, myBufferImportant, myChecklist
    # Extraer el status del FormData
    # status = request.form.get('status')
    status = int(request.form.get('status', 0))

    if status == 1:
        myIndex_Resume = myIndex_Resume +1
        print("----SE VA A PROCESAR AUDIO PARA EL RESUMEN IMPORTANTE-----")
        print("****El index actual es: " + str(myIndex_Resume) + " *****")
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
            buf = io.BytesIO(reduced_bytes)
            buf.name = audio_file.filename or "audio.wav"   # ← aquí
            resp = client.audio.transcriptions.create(
            model="whisper-1",
            file=buf,
            language="es",
            response_format="json"
        )

            text = resp["text"] if isinstance(resp, dict) else resp.text
            
            myBufferImportant.append(text)
            return jsonify({"transcription": text})

        except Exception as e:
            app.logger.error(f"Error en Whisper: {e}")
            return jsonify({"error": str(e)}), 500
    elif status==2:
        try:
            myIndex_Resume = myIndex_Resume + 1
            print("----SE VA A PROCESAR IMAGEN PARA EL RESUMEN IMPORTANTE-----")
            print("****El index actual es: " + str(myIndex_Resume) + " *****")

            # Verificar si la imagen está en la request
            image = request.files.get('img')
            if image is None:
                print("ERROR: No se recibió la imagen en el request")
                return jsonify({'status': 'error', 'message': 'No se recibió imagen'}), 400

            print("✓ Imagen recibida correctamente")
            print("Nombre del archivo:", image.filename if hasattr(image, 'filename') else "Sin nombre")

            # Convertir base64 a frame numpy
            print("Intentando convertir imagen a frame...")
            frame = blob_to_frame(image)  # Nueva función para blob

            if frame is None:
                print("ERROR: No se pudo convertir la imagen a frame")
                return jsonify({'status': 'error', 'message': 'Imagen no válida'}), 400

            print("✓ Frame convertido exitosamente")
            print("Dimensiones del frame:", frame.shape if hasattr(frame, 'shape') else "No disponible")

            # Llamar a la función de análisis AI con el frame
            print("Iniciando análisis con IA3...")
            try:
                ai_result = analyze_with_ai3(frame)
                print("✓ Análisis IA3 completado")
                print("Resultado de la IA3: " + str(ai_result))

                if ai_result is None or ai_result == "":
                    print("WARNING: El resultado de IA3 está vacío")

            except Exception as e:
                print("ERROR en analyze_with_ai3:", str(e))
                return jsonify({'status': 'error', 'message': 'Error en análisis IA3: ' + str(e)}), 500

            # Agregar resultado al buffer
            myBufferImportant.append(ai_result)
            print("✓ Resultado agregado al buffer")
            print("Contenido actual del buffer:", myBufferImportant)
            print("Longitud del buffer:", len(myBufferImportant))

            if myIndex_Resume == 2:
                print("----INICIANDO ANÁLISIS FINAL (índice alcanzó 2)-----")
                myIndex_Resume = 0
                print("✓ Índice reiniciado a 0")

                # Verificar contenido del buffer antes de procesar
                if not myBufferImportant:
                    print("ERROR: Buffer vacío antes del análisis final")
                    return jsonify({'status': 'error', 'message': 'Buffer vacío'}), 500

                print("Contenido del buffer antes del análisis:", myBufferImportant)

                # Juntar con espacios
                try:
                    texto_completo = " ".join(myBufferImportant)
                    print("✓ Texto completo generado")
                    print("Longitud del texto completo:", len(texto_completo))
                    print("Primeros 200 caracteres:", texto_completo[:200] + "..." if len(texto_completo) > 200 else texto_completo)

                except Exception as e:
                    print("ERROR al juntar el buffer:", str(e))
                    return jsonify({'status': 'error', 'message': 'Error al procesar buffer: ' + str(e)}), 500

                # Análisis final
                try:
                    print("Iniciando análisis final del resumen...")
                    content_final = analyze_resume(texto_completo, myChecklist)
                    print("✓ Análisis final completado")
                    print("Longitud del contenido final:", len(str(content_final)) if content_final else "None")

                    if content_final is None:
                        print("WARNING: analyze_resume devolvió None")
                        return jsonify({'status': 'error', 'message': 'El análisis final no produjo resultados'}), 500

                    print("✓ Retornando resultado exitoso")
                    return jsonify({'status': 'success', 'result': content_final}), 200

                except Exception as e:
                    print("ERROR en analyze_resume:", str(e))
                    return jsonify({'status': 'error', 'message': 'Error en análisis final: ' + str(e)}), 500

            else:
                print("✓ Imagen procesada, esperando más imágenes (índice actual: " + str(myIndex_Resume) + ")")
                return jsonify({'status': 'partial', 'message': 'Imagen procesada, esperando más'}), 200

        except Exception as e:
            print("ERROR GENERAL en el endpoint:", str(e))
            print("Tipo de error:", type(e).__name__)
            import traceback
            print("Traceback completo:")
            traceback.print_exc()
            return jsonify({'status': 'error', 'message': 'Error interno del servidor: ' + str(e)}), 500

@app.route('/generate_checklist', methods=['POST'])
def gen_check():
    global myChecklist
    data = request.get_json()
    print("Data recibida:", data)  # Debug
    data_file = data.get('file_content')  # Corregido
    print("File content:", data_file) 
    myInfo = get_checklist(data_file)
    myChecklist = myInfo
       # Retornar como JSON
    return jsonify({
        'status': 'success',
        'checklist': myInfo,
        'message': 'Checklist generado correctamente'
    })






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

def blob_to_frame(image_file):
    try:
        # Leer datos binarios del archivo
        image_data = image_file.read()
        # Convertir bytes a numpy array
        nparr = np.frombuffer(image_data, np.uint8)
        # Decodificar en imagen OpenCV
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return frame
    except Exception as e:
        print(f"Error convirtiendo blob a frame: {e}")
        return None

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

    
if __name__ == '__main__':
    # Arranca la aplicación Flask sin usar socketio
    app.run(host='0.0.0.0', port=5000)