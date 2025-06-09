// Función para subir todos los archivos de una vez

// Función para obtener contenido de un archivo
// async function getFileContent(url) {
//   const resp = await fetch(url);
//   if (!resp.ok) throw new Error(`Error ${resp.status} al obtener ${url}`);
//   return await resp.text();
// }


async function uploadAllFilesAtOnce() {

  try {
    // Definir los archivos a procesar
    const fileConfigs = [
      { url: '/download_log', filename: 'A_Eye.txt' },
      { url: '/download_screen', filename: 'B_Eye.txt' },
      { url: '/download_audio_b', filename: 'B_Ear.txt' },
      { url: '/download_eye_c', filename: 'C_Eye.txt' }
    ];


    const filesData = [];

    for (let i = 0; i < fileConfigs.length; i++) {
      const config = fileConfigs[i];

      try {
        const content = await getFileContent(config.url);
        filesData.push({
          filename: config.filename,
          content: content
        });
        console.log(`✅ Contenido obtenido: ${config.filename}`);
      } catch (error) {
        console.error(`❌ Error obteniendo ${config.filename}:`, error);
        // Continuar con los otros archivos
        filesData.push({
          filename: config.filename,
          content: `Error al obtener contenido: ${error.message}`
        });
      }
    }


    const response = await fetch('/upload-multiple-files', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: filesData
      })
    });

    const result = await response.json();

    if (result.success) {


      console.log('🎉 Resultado de subida:', result);

      // Mostrar detalles
      result.results.forEach(file => {
        if (file.success) {
          console.log(`✅ ${file.filename} - Subido exitosamente`);
        } else {
          console.error(`❌ ${file.filename} - Error: ${file.error}`);
        }
      });

      // Opcional: abrir la carpeta de Drive
      if (result.folder_link) {
        const openFolder = confirm(
          `Archivos subidos exitosamente!\n` +
          `• Exitosos: ${result.summary.successful}\n` +
          `• Fallidos: ${result.summary.failed}\n\n` +
          `¿Quieres abrir la carpeta en Google Drive?`
        );
        if (openFolder) {
          window.open(result.folder_link, '_blank');
        }
      }

    } else {
      throw new Error(result.error);
    }



  } catch (e) {
    console.error('❌ Error en subida:', e);


    alert('Hubo un error al subir los archivos: ' + e.message);
  }
}


async function downloadFile(url, filename) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Error ${resp.status}`);
  const blob = await resp.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

let myBoolean = true

let audioCtx, masterStream;
let fullRecorder, chunkRecorder, partialRecorder, partialRecorder2, partialRecorder3;
let chunkTimer;
let mainTranscription

// 1) Arranca ambos recorders

async function startRecordingAllMics() {



  try {
    // 1) Pide permiso global y luego lo libera
    const temp = await navigator.mediaDevices.getUserMedia({ audio: true });
    temp.getTracks().forEach(t => t.stop());

    // 2) Lista todos los micrófonos disponibles
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === "audioinput");

    // // 3) Abre cada micrófono y recoge su pista en un array
    // const tracks = await Promise.all(
    //   mics.map(async (mic, index) => {
    //     //---------------LOGICA PARA AGREGAR MICROFONOS AL SELECT
    //     const option = document.createElement('div');
    //     option.className = 'cPointer br10px w95 h50px bcSecond fShrink0 dFlex jcCenter aiCenter cThird ff2 fw500 fs1 select taCenter'
    //     option.setAttribute('data-value', index + 1)
    //     option.id = `myAudio${index + 1}`

    //     // Mostrar nombre del micrófono si está disponible
    //     if (mic.label) {
    //       option.innerHTML = `${mic.label} (Mic ${index + 1})`;
    //     } else {
    //       option.innerHTML = `Micrófono ${index + 1} (ID: ${mic.deviceId.slice(0, 10)}...)`;
    //     }
    //     option.addEventListener('click', () => { option.classList.toggle('select') })

    //     const myDivAudio = document.getElementById('divAudio')
    //     myDivAudio.appendChild(option)
    //     //---------
    //     const stream = await navigator.mediaDevices.getUserMedia({
    //       audio: { deviceId: { exact: mic.deviceId } }
    //     });
    //     return stream.getAudioTracks()[0];
    //   })
    // );


    // 3) Abre cada micrófono y recoge su pista en un array
    console.log(`🎤 Iniciando procesamiento de ${mics.length} micrófonos encontrados`);

    const tracks = await Promise.all(
      mics.map(async (mic, index) => {
        console.log(`\n--- Procesando Micrófono ${index + 1} ---`);
        console.log(`ID del dispositivo: ${mic.deviceId}`);
        console.log(`Etiqueta: ${mic.label || 'Sin etiqueta'}`);
        console.log(`Tipo: ${mic.kind}`);

        //---------------LOGICA PARA AGREGAR MICROFONOS AL SELECT
        const option = document.createElement('div');
        option.className = 'cPointer br10px w95 h50px bcSecond fShrink0 dFlex jcCenter aiCenter cThird ff2 fw500 fs1 select taCenter'
        option.setAttribute('data-value', index + 1)
        option.id = `myAudio${index + 1}`

        // Mostrar nombre del micrófono si está disponible
        if (mic.label) {
          option.innerHTML = `${mic.label} (Mic ${index + 1})`;
          console.log(`✅ Elemento creado con etiqueta: ${mic.label}`);
        } else {
          option.innerHTML = `Micrófono ${index + 1} (ID: ${mic.deviceId.slice(0, 10)}...)`;
          console.log(`⚠️ Elemento creado sin etiqueta, usando ID: ${mic.deviceId.slice(0, 10)}`);
        }

        option.addEventListener('click', () => {
          option.classList.toggle('select');
          console.log(`🖱️ Click en micrófono ${index + 1}, estado select:`, option.classList.contains('select'));
        });

        const myDivAudio = document.getElementById('divAudio');
        if (myDivAudio) {
          myDivAudio.appendChild(option);
          console.log(`📋 Elemento agregado al DOM para micrófono ${index + 1}`);
        } else {
          console.error(`❌ No se encontró el elemento 'divAudio' en el DOM`);
        }

        //---------

        try {
          console.log(`🔄 Intentando acceder al micrófono ${index + 1}...`);

          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: mic.deviceId } }
          });

          console.log(`✅ Stream obtenido para micrófono ${index + 1}`);
          console.log(`   Estado del stream:`, stream.active ? 'Activo' : 'Inactivo');
          console.log(`   ID del stream:`, stream.id);

          const audioTracks = stream.getAudioTracks();
          console.log(`   Número de pistas de audio: ${audioTracks.length}`);

          if (audioTracks.length > 0) {
            const track = audioTracks[0];
            console.log(`   Pista principal:`, {
              id: track.id,
              label: track.label,
              readyState: track.readyState,
              enabled: track.enabled,
              muted: track.muted
            });

            // Obtener configuración detallada de la pista
            const settings = track.getSettings();
            console.log(`   Configuración de la pista:`, settings);

            // Verificar capacidades
            const capabilities = track.getCapabilities();
            console.log(`   Capacidades del micrófono:`, capabilities);

            // Verificar actividad de audio rápidamente
            try {
              const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
              const source = audioCtx.createMediaStreamSource(stream);
              const analyser = audioCtx.createAnalyser();
              analyser.fftSize = 256;
              source.connect(analyser);

              const dataArray = new Uint8Array(analyser.frequencyBinCount);

              // Verificar por 500ms si hay actividad
              let hasActivity = false;
              const startTime = Date.now();

              const checkActivity = () => {
                analyser.getByteFrequencyData(dataArray);
                const maxLevel = Math.max(...dataArray);
                if (maxLevel > 5) {
                  hasActivity = true;
                }
              };

              const activityInterval = setInterval(() => {
                checkActivity();
                if (Date.now() - startTime > 500) {
                  clearInterval(activityInterval);
                  console.log(`   🎵 Actividad de audio detectada: ${hasActivity ? 'SÍ' : 'NO'}`);
                  audioCtx.close();
                }
              }, 50);

            } catch (activityError) {
              console.log(`   ⚠️ No se pudo verificar actividad de audio:`, activityError.message);
            }

            return track;
          } else {
            console.warn(`⚠️ El stream del micrófono ${index + 1} no tiene pistas de audio`);
            return null;
          }

        } catch (error) {
          console.error(`❌ Error accediendo al micrófono ${index + 1}:`, error.message);
          console.error(`   Tipo de error:`, error.name);
          console.error(`   Detalles:`, error);

          // Marcar visualmente el elemento como problemático
          option.style.opacity = '0.5';
          option.style.backgroundColor = '#ffcccc';
          option.innerHTML += ' ❌ (Error)';

          return null;
        }
      })
    );

    // Filtrar pistas válidas
    const validTracks = tracks.filter(track => track !== null);
    console.log(`\n📊 RESUMEN FINAL:`);
    console.log(`   Total de micrófonos detectados: ${mics.length}`);
    console.log(`   Micrófonos con acceso exitoso: ${validTracks.length}`);
    console.log(`   Micrófonos con errores: ${mics.length - validTracks.length}`);

    if (validTracks.length === 0) {
      console.error(`❌ ¡PROBLEMA CRÍTICO! No se pudo acceder a ningún micrófono`);
      throw new Error('No se pudo acceder a ningún micrófono');
    } else if (validTracks.length < mics.length) {
      console.warn(`⚠️ Solo ${validTracks.length} de ${mics.length} micrófonos están funcionando correctamente`);
    } else {
      console.log(`✅ Todos los micrófonos están funcionando correctamente`);
    }

    // Continuar con las pistas válidas
    console.log(`🔄 Continuando con ${validTracks.length} pistas de audio válidas`);

    // 4) Construye un MediaStream "maestro" con todas las pistas
    masterStream = new MediaStream(tracks);

    // 5) Crea un AudioContext
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // 6) Creamos un nodo de ganancia que va a mezclar todas las señales
    const mixGain = audioCtx.createGain();
    const destination = audioCtx.createMediaStreamDestination();

    // 7) Para cada pista, crea su fuente y conéctala al mixGain
    tracks.forEach(track => {
      const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
      src.connect(mixGain);
    });

    // 8) Conecta mixGain → destination para obtener destination.stream
    mixGain.connect(destination);

    // 9) Ahora **graba** desde mixGain, no desde destination
    fullRecorder = new Recorder(mixGain, { numChannels: 1 }); // Para el archivo completo
    partialRecorder = new Recorder(mixGain, { numChannels: 1 }); // Para el segundo segmento (de 2:01 a 4:00)
    partialRecorder2 = new Recorder(mixGain, { numChannels: 1 });
    partialRecorder3 = new Recorder(mixGain, { numChannels: 1 });

    fullRecorder.record();
    partialRecorder.record();
    partialRecorder3.record();

    // 10) Cada 10 segundos corta el chunk y lo envía
    chunkTimer = setInterval(() => {
      //huhm
      if (myBoolean) {
        console.log('Entró')
        partialRecorder2.stop();
        partialRecorder2.exportWAV(async (blob) => {
          const form = new FormData();
          form.append("audio", blob, `chunk-${Date.now()}.wav`);

          const res = await fetch("/process_audio", {
            method: "POST",
            body: form
          });
          const json = await res.json();
          console.log("Chunk analysis:", json);

          // Reiniciamos para el siguiente fragmento
          partialRecorder2.clear();
          partialRecorder2.record();
        });
      }

    }, 10_000);

    // 11) Transcripción a los 2 minutos (después de enviar el primer fragmento)
    setInterval(async () => {
      //huhm
      if (myBoolean) {
        // Detenemos la grabación después de 2 minutos
        console.log("se entroooo---------------")
        partialRecorder.stop();

        // Enviar el primer segmento (0-2 minutos) para transcripción
        partialRecorder.exportWAV(async (blob) => {
          const form = new FormData();
          form.append("audio", blob, `full-audio-0-2-${Date.now()}.wav`);
          const res = await fetch("/transcribe", {
            method: "POST",
            body: form
          });
          const { transcription } = await res.json();
          console.log('Transcripción recibida:', transcription);
          const now = new Date();
          // Opción A: hora local, formato HH:MM:SS
          const timeStr = now.toLocaleTimeString();
          mainTranscription += `------ ${timeStr} ------\n${transcription}\n\n`;
          // Reiniciar la grabación para la segunda parte (2:01-4:00)




          partialRecorder.clear();

          // Crear una nueva instancia del recorder para la segunda parte
          partialRecorder = new Recorder(mixGain, { numChannels: 1 });  // Crear un nuevo recorder
          partialRecorder.record();
        });
      }

    }, 3 * 60 * 1000); // 2 minutos


    // 12) Transcripción a los 1 minutos (después de enviar el primer fragmento)
    setInterval(async () => {
      //huhm
      if (myBoolean) {
        // Detenemos la grabación después de 2 minutos
        console.log("se entroooo a la primer llamada de resumen importate---------------")
        partialRecorder3.stop();

        // Enviar el primer segmento (0-2 minutos) para transcripción
        partialRecorder3.exportWAV(async (blob) => {
          const form = new FormData();
          form.append("audio", blob, `full-audio-0-2-${Date.now()}.wav`);
          form.append("status", 1);
          const res = await fetch("/resume", {
            method: "POST",
            body: form // Solo enviar el FormData
          });
          const { transcription } = await res.json();
          console.log('Resumen Importante Recibido - transcripcion:', transcription);
          const now = new Date();
          // Opción A: hora local, formato HH:MM:SS
          // const timeStr = now.toLocaleTimeString(); 
          // mainTranscription += `------ ${timeStr} ------\n${transcription}\n\n`;
          // Reiniciar la grabación para la segunda parte (2:01-4:00)




          partialRecorder3.clear();

          // Crear una nueva instancia del recorder para la segunda parte
          partialRecorder3 = new Recorder(mixGain, { numChannels: 1 });  // Crear un nuevo recorder
          partialRecorder3.record();
        });
      }

    }, 1 * 60 * 1000); // 1 minutos



    // 12) Habilita el botón para detener y descargar
    document.getElementById("downloadAll").disabled = false;

  } catch (err) {
    console.error("Error arrancando grabación de micrófonos:", err);
  }
}


// -------------------------------------------------

// 2) Para todo y descarga el WAV completo


// Ejemplo de función para detener y descargar la mezcla completa:
// Función para detener y descargar la mezcla completa
// Función principal modificada
async function stopAndDownloadFull() {
  clearInterval(chunkTimer);

  // Detener la grabación cuando el usuario presiona el botón
  fullRecorder.stop();
  partialRecorder.stop();

  // Exportar el WAV completo (audio de 0 a 4 minutos)
  fullRecorder.exportWAV(async (fullBlob) => {
    const timestamp = new Date().toISOString();
    const filename = `session-full-${timestamp}.wav`;

    // Enviar el audio completo al endpoint /transcribe para la "segunda parte" (2:01 a 4:00)
    partialRecorder.exportWAV(async (partialBlob) => {
      const formData = new FormData();
      formData.append('audio', partialBlob, filename);

      try {
        const resp = await fetch('/transcribe', {
          method: 'POST',
          body: formData
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`Error ${resp.status}: ${errText}`);
        }

        const { transcription } = await resp.json();
        console.log('Transcripción recibida:', transcription);
        const now = new Date();
        const timeStr = now.toLocaleTimeString();
        mainTranscription += `------ ${timeStr} ------\n${transcription}\n\n`;
        
        // EN LUGAR DE DESCARGAR, SUBIR TODO
        await uploadTranscriptionAndAudio(mainTranscription, fullBlob, timestamp);

      } catch (err) {
        console.error('Falló la transcripción:', err);
        // Si falla la transcripción, aún así subir el audio
        await uploadAudioOnly(fullBlob, timestamp);
      }
    });
  });
}

// Función para subir transcripción y audio
async function uploadTranscriptionAndAudio(transcriptionContent, audioBlob, timestamp) {
  try {
    console.log('📤 Iniciando subida de transcripción y audio...');

    // 1. Subir el archivo de audio (WAV) primero
    const audioUploaded = await uploadAudioFile(audioBlob, timestamp);
    
    if (!audioUploaded) {
      console.warn('⚠️ No se pudo subir el audio, pero continuando con archivos de texto...');
    }

    // 2. Subir todos los archivos de texto incluyendo la transcripción
    await uploadAllFilesWithTranscription(transcriptionContent, timestamp);

  } catch (error) {
    console.error('❌ Error en subida completa:', error);
    alert('Hubo un error al subir la sesión: ' + error.message);
  }
}

// Función para subir solo el audio (en caso de que falle la transcripción)
async function uploadAudioOnly(audioBlob, timestamp) {
  try {
    console.log('📤 Subiendo solo audio (sin transcripción)...');
    const audioUploaded = await uploadAudioFile(audioBlob, timestamp);
    
    if (audioUploaded) {
      console.log('✅ Audio subido exitosamente');
      // Opcional: subir otros archivos del sistema sin transcripción
      await uploadAllFilesWithTranscription('Error: No se pudo generar transcripción', timestamp);
    }
  } catch (error) {
    console.error('❌ Error subiendo audio:', error);
    alert('Error al subir audio: ' + error.message);
  }
}

// Función para subir archivo de audio
async function uploadAudioFile(audioBlob, timestamp) {
  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, `session-full-${timestamp}.wav`);
    formData.append('timestamp', timestamp);
    
    const response = await fetch('/upload-audio-file', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log('✅ Audio subido:', result);
    return true;

  } catch (error) {
    console.error('❌ Error subiendo archivo de audio:', error);
    return false;
  }
}

// Función para subir archivos de texto (modificada de tu función original)
async function uploadAllFilesWithTranscription(transcriptionContent, timestamp) {
  try {
    console.log('📤 Iniciando subida de archivos de texto...');

    // Definir los archivos a procesar
    const fileConfigs = [
      { url: '/download_log', filename: 'A_Eye.txt' },
      { url: '/download_screen', filename: 'B_Eye.txt' },
      { url: '/download_audio_b', filename: 'B_Ear.txt' },
      { url: '/download_eye_c', filename: 'C_Eye.txt' }
    ];

    const filesData = [];

    // Agregar la transcripción como primer archivo
    filesData.push({
      filename: 'A_Ear.txt',
      content: transcriptionContent
    });

    // Obtener contenido de otros archivos
    for (let i = 0; i < fileConfigs.length; i++) {
      const config = fileConfigs[i];
      try {
        const content = await getFileContent(config.url);
        filesData.push({
          filename: config.filename,
          content: content
        });
        console.log(`✅ Contenido obtenido: ${config.filename}`);
      } catch (error) {
        console.error(`❌ Error obteniendo ${config.filename}:`, error);
        filesData.push({
          filename: config.filename,
          content: `Error al obtener contenido: ${error.message}`
        });
      }
    }

    // Subir todos los archivos
    const response = await fetch('/upload-multiple-files', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: filesData,
        session_timestamp: timestamp
      })
    });

    const result = await response.json();

    if (result.success) {
      console.log('🎉 Archivos de texto subidos exitosamente:', result);

      // Mostrar detalles
      result.results.forEach(file => {
        if (file.success) {
          console.log(`✅ ${file.filename} - Subido exitosamente`);
        } else {
          console.error(`❌ ${file.filename} - Error: ${file.error}`);
        }
      });

      // Mostrar confirmación final
      showUploadSuccess(result, timestamp);

    } else {
      throw new Error(result.error || 'Error desconocido en la subida');
    }

  } catch (error) {
    console.error('❌ Error en subida de archivos:', error);
    alert('Hubo un error al subir los archivos: ' + error.message);
  }
}

// Función para mostrar éxito de subida
function showUploadSuccess(result, timestamp) {
  const successCount = result.summary?.successful || result.results?.filter(r => r.success).length || 0;
  const failedCount = result.summary?.failed || result.results?.filter(r => !r.success).length || 0;

  const message = `¡Sesión completa subida exitosamente! 🎉\n\n` +
    `📁 Archivos subidos:\n` +
    `• Audio: session-full-${timestamp}.wav\n` +
    `• Archivos de texto exitosos: ${successCount}\n` +
    `• Archivos fallidos: ${failedCount}\n\n` +
    `¿Quieres abrir la carpeta en Google Drive?`;

  if (result.folder_link) {
    const openFolder = confirm(message);
    if (openFolder) {
      window.open(result.folder_link, '_blank');
    }
  } else {
    alert(`¡Sesión subida exitosamente! 🎉\n\nArchivos procesados: ${successCount + failedCount}`);
  }
}

// Función auxiliar para obtener contenido de archivos (ya la tenías)
async function getFileContent(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Error ${resp.status} al obtener ${url}`);
  return await resp.text();
}

// ------------------------------------------


// Evento del botón: detiene el recorder (dispara onstop)
document.getElementById('downloadAll').addEventListener('click', async () => {
  stopAndDownloadFull() //con esta llamada ya descarga como tal todo el audio de la sesión
  // Usa:
  // try {
  //   await uploadAllFilesAtOnce();
  // } catch (e) {
  //   console.error('Subida fallida:', e);
  //   alert('Hubo un error al subir: ' + e.message);
  // }
  // try {
  //      await downloadFile('/download_log',    'A_Eye.txt');
  //      await downloadFile('/download_screen', 'B_Eye.txt');
  //   await downloadFile('/download_audio_b', 'B_Ear.txt');
  //   await downloadFile('/download_eye_c', 'C_Eye.txt');
  // } catch (e) {
  //   console.error('Descarga fallida:', e);
  //   alert('Hubo un error al descargar: ' + e.message);
  // }
});


async function downloadInformeContextual() {
  try {
    // 1) Llamar al endpoint que analiza los buffers
    const resp = await fetch('/analyze_buffers', {
      method: 'POST'
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Error ${resp.status}: ${errText}`);
    }

    // 2) Extraer el análisis
    const { analysis } = await resp.json();
    console.log('Informe recibido:', analysis);

    // 3) Crear un Blob de texto y forzar la descarga
    const txtBlob = new Blob([analysis], { type: 'text/plain' });
    const txtUrl = URL.createObjectURL(txtBlob);
    const link = document.createElement('a');
    link.href = txtUrl;
    link.download = 'Informe_Contextual.txt';
    document.body.appendChild(link);
    link.click();

    // 4) Limpieza
    URL.revokeObjectURL(txtUrl);
    link.remove();

  } catch (err) {
    console.error('Error al generar el informe contextual:', err);
    // Opcional: mostrar un aviso al usuario
  }
}


// Al cargar la página, iniciamos todo automáticamente
// window.addEventListener('load', startRecordingAllMics);


// ------------------------ L O G I C A     P A R A    G R A B A R     P A N T A L L A --------------

let currentFrame = null;

async function startScreenShare() {
  try {
    // Solicitar permiso y capturar la pantalla
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: false
    });

    const video = document.getElementById('myDivScreen');
    video.srcObject = stream;

    // Crear un canvas para capturar frames
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    });

    // Función para capturar frame actual del video y almacenarlo en currentFrame
    async function captureAndSendFrame() {
      if (video.videoWidth && video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        currentFrame = canvas.toDataURL('image/png');

        // Enviar el frame al servidor Flask

        //huhm
        try {

          const response = await fetch('/upload_frame', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image: currentFrame})
          });

          if (!response.ok) {
            console.error('Error enviando frame al servidor');
          } else {
            console.log('Frame enviado con éxito');
          }
        } catch (error) {
          console.error('Error en fetch:', error);
        }


      }
    }

    async function captureAndSendFrame2() {
      if (video.videoWidth && video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        currentFrame = canvas.toDataURL('image/png');

        // Enviar el frame al servidor Flask

        //huhm
        // Convertir canvas a blob en lugar de string base64
        canvas.toBlob(async (blob) => {
          try {
            console.log('ejecutando fetch 2...')
            const form = new FormData();
            form.append("img", blob, "image.png"); // Enviar como blob, no como string base64
            form.append("status", "2"); // Enviar como string para estar seguro

            const response = await fetch('/resume', {
              method: 'POST',
              body: form
            });

            if (!response.ok) {
              console.error('Error enviando frame al servidor');
            } else {
              const now = new Date();
              const horaActual = now.toLocaleTimeString('es-ES', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
              });
              // Leer el contenido JSON de la respuesta
              const data = await response.json();
              console.log('Frame enviado con éxito');
              console.log('Contenido completo:', data);
              console.log('Resultado del análisis - RESUMEN:', data.result);
              const divImportant = document.getElementById('divImportant')
              const newDiv = document.createElement('div')
              newDiv.className = 'w90  fShrink0 hAuto taCenter dFlex aiCenter jcCenter bsBorderBox p10 bcThirdLight ff2 fs1 br5px'
              newDiv.textContent = `${horaActual} - ${data.result}`
              divImportant.appendChild(newDiv)
            }

            // Resto de tu código...
          } catch (error) {
            console.error('Error en fetch:', error);
          }
        }, 'image/png');



      }
    }


    // Ejecutar cada 5 segundos
    //huhm
    setInterval(captureAndSendFrame, 10 * 1000);
    //new-huhm
    setInterval(captureAndSendFrame2, 1.5 * 60 * 1000);


  } catch (err) {
    console.error("Error al capturar pantalla: ", err);
  }
}




// ----------------- L O G I C A    P A R A    G R A B A R    L A S     C A M A R A S ----------------

async function listAndShowCams() {
  const camsContainer = document.getElementById('cams');


  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (e) {
    console.warn("Permiso de cámara denegado o no disponible.", e);
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter(device => device.kind === 'videoinput');
  camsContainer.innerHTML = '';
  console.log('cams: ' + videoInputs)
  // Array para almacenar objetos con video y canvas para cada cámara
  const activeCams = [];

  // Objeto para mapear deviceId con los elementos de la cámara
  const cameraElements = {};
  for (let i = 0; i < videoInputs.length; i++) {
    const device = videoInputs[i];

    try {


      //--------------parte para el menu de camaras:
      const option = document.createElement('div');
      option.className = 'cPointer br10px w95 h50px bcSecond fShrink0 dFlex jcCenter aiCenter cThird ff2 fw500 fs1 select taCenter'
      option.setAttribute('data-value', i + 1)
      option.id = `myVideo${device.deviceId}`
      // Modificamos el event listener
      option.addEventListener('click', () => toggleCamera(option, device.deviceId))

      // Usar el nombre real si está disponible
      if (device.label) {
        option.innerHTML = `${device.label} (Cámara ${i + 1})`;
      } else {
        // Caso de respaldo (debería ser raro después del permiso)
        option.innerHTML = `Cámara ${i + 1} - ${device.deviceId.slice(0, 10)}`;
      }

      // option.title = `ID: ${device.deviceId}`; // Tooltip
      const myDivVideo = document.getElementById('divVideo')

      myDivVideo.appendChild(option);
      //------------------------------
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: device.deviceId } },
        audio: false
      });

      const camBox = document.createElement('div');
      camBox.classList.add('camBox');

      const title = document.createElement('label');
      title.textContent = `Cámara ${i + 1}: ${device.label || 'Sin nombre'}`;
      title.className = 'ff2 fs1 fw300 bsBorderBox p20'
      camBox.appendChild(title);


      const video = document.createElement('video');
      video.id = `myCamera${i + 1}`
      video.autoplay = true;
      video.playsInline = true;
      video.width = 190;
      video.height = 110;
      video.srcObject = stream;
      camBox.appendChild(video);
      console.log('hola')
      camsContainer.appendChild(camBox);

      // Crear canvas para capturar frames
      const canvas = document.createElement('canvas');
      canvas.width = 190;
      canvas.height = 110;

      //----FRUNCIONES PARA HABILITAR Y DESHABILITAR CAMARA:

      // Función para habilitar/deshabilitar cámara
      async function toggleCamera(optionElement, deviceId) {
        const cameraData = cameraElements[deviceId];

        if (!cameraData) return;

        if (cameraData.isActive) {
          // Deshabilitar cámara
          disableCamera(cameraData);
          optionElement.classList.remove('select');
        } else {
          // Habilitar cámara
          await enableCamera(cameraData);
          optionElement.classList.add('select');
        }
      }
      // Función para deshabilitar cámara
      function disableCamera(cameraData) {
        // Detener el stream
        if (cameraData.stream) {
          cameraData.stream.getTracks().forEach(track => track.stop());
        }

        // Ocultar o remover el video del DOM
        if (cameraData.camBox) {
          cameraData.camBox.style.display = 'none';
        }

        // Limpiar el srcObject del video
        if (cameraData.video) {
          cameraData.video.srcObject = null;
        }

        cameraData.isActive = false;
        console.log(`Cámara ${cameraData.deviceId} deshabilitada`);
      }

      // Función para habilitar cámara
      async function enableCamera(cameraData) {
        try {
          // Obtener nuevo stream
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: cameraData.deviceId } },
            audio: false
          });

          // Asignar el nuevo stream al video
          cameraData.video.srcObject = stream;
          cameraData.stream = stream;

          // Mostrar el video en el DOM
          if (cameraData.camBox) {
            cameraData.camBox.style.display = 'block';
          }

          cameraData.isActive = true;
          console.log(`Cámara ${cameraData.deviceId} habilitada`);

        } catch (error) {
          console.error(`Error al habilitar cámara ${cameraData.deviceId}:`, error);
        }
      }

      //-----------------------------------------------------
      // activeCams.push({ video, canvas, deviceId: device.deviceId });
      const cameraData = {
        video,
        canvas,
        deviceId: device.deviceId,
        stream,
        camBox,
        option,
        isActive: true
      };

      activeCams.push(cameraData);
      cameraElements[device.deviceId] = cameraData;
    } catch (err) {
      console.warn(`No se pudo acceder a la cámara ${device.label}:`, err);
    }
  }

  // Función para capturar y enviar frames
  async function captureAndSendFrames() {


    activeCams.forEach(async ({ video, canvas, deviceId }, index) => {
      if (video.readyState >= 2) { // HAVE_CURRENT_DATA
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameBase64 = canvas.toDataURL('image/jpeg'); // Base64 jpg
        if (document.getElementById(`myVideo${deviceId}`).classList.contains('select')) {
          // console.log('***camara activa***')
          //huhm
          try {
          const response = await fetch('/upload_frame2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deviceId,
              image: frameBase64
            })
          });
          if (!response.ok) {
            console.error(`Error enviando frame de cámara ${index + 1}`);
          } else {
            Opcional: console.log(`Frame cámara ${index + 1} enviado`);
          }
        } catch (error) {
          console.error(`Error en fetch para cámara ${index + 1}:`, error);
        }


        }
        

      }
    });
  }
  //huhm
  // Capturar y enviar cada 10 segundos
  setInterval(captureAndSendFrames, 1* 60 * 1000);
}


const myStartBt = document.getElementById('startAll')

myStartBt.addEventListener('click', () => {
  myStartBt.disabled = true;
  startRecordingAllMics();
  listAndShowCams();

  startScreenShare();

})

