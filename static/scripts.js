// Función para subir todos los archivos de una vez
let entregables = {
  archivosGenerados: 0,
  names: [],
  erroresGeneracion: [],
  errorDetails: []
};
// Función para obtener contenido de un archivo
// async function getFileContent(url) {
//   const resp = await fetch(url);
//   if (!resp.ok) throw new Error(`Erro8r ${resp.status} al obtener ${url}`);
//   return await resp.text();
// }
let MY_STATUS_SYSTEM = ''
let MY_LAST_CHECKLIST = ''
let MY_CHECKLIST = ''
const btReanude = document.getElementById('btReanude')
const btPause = document.getElementById('btPause')
const btChangeWindow = document.getElementById('btChangeWindow')
const downloadAll = document.getElementById('downloadAll')


// btPause.disabled = true
// btReanude.disabled = true
// btChangeWindow.disabled = true
// downloadAll.disabled = true


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
        addSystemMessage2('✅ Se obtuvo el contenido del archivo: ' + config.filename)
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
    addSystemMessage2('Subiendo archivos a la carpeta de Drive...')
    const result = await response.json();

    if (result.success) {


      console.log('🎉 Resultado de subida:', result);

      // Mostrar detalles
      result.results.forEach(file => {
        if (file.success) {
          console.log(`✅ ${file.filename} - Subido exitosamente`);
          addSystemMessage2(`✅ ${file.filename} - Subido exitosamente`)
        } else {
          console.error(`❌ ${file.filename} - Error: ${file.error}`);
          addSystemMessage2(`❌ ${file.filename} - Error: ${file.error}`)
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



async function upload_Status() {

  try {
   


    const filesData = [];

    

      try {
        filesData.push({
          filename: `Status_Resport.txt`,
          content: MY_STATUS_SYSTEM
        });
        //console.log(`✅ Contenido obtenido: ${config.filename}`);
        //addSystemMessage2('✅ Se obtuvo el contenido del archivo: ' + config.filename)
      } catch (error) {
        //console.error(`❌ Error obteniendo ${config.filename}:`, error);
        // Continuar con los otros archivos
       
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
    addSystemMessage2('📤 Subiendo Reporte de Status a Drive...')
    const result = await response.json();

    if (result.success) {


      console.log('🎉 Resultado de subida:', result);

      // Mostrar detalles
      result.results.forEach(file => {
        if (file.success) {
          console.log(`✅ ${file.filename} - Subido exitosamente`);
          addSystemMessage2(`✅ ${file.filename} - Subido exitosamente`)
        } else {
          console.error(`❌ ${file.filename} - Error: ${file.error}`);
          addSystemMessage2(`❌ ${file.filename} - Error: ${file.error}`)
        }
      });

      
    } else {
      throw new Error(result.error);
    }



  } catch (e) {
    console.error('❌ Error en subida:', e);


    //alert('Hubo un error al subir los archivos: ' + e.message);
  }
}

function htmlToPlainText(htmlString) {
  // Crear un elemento temporal para manipular el HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlString;
  
  // Obtener todos los elementos <li>
  const listItems = tempDiv.querySelectorAll('li');
  
  let plainText = '';
  
  listItems.forEach((li, index) => {
    // Agregar numeración manual
    plainText += `${index + 1}. `;
    
    // Procesar el contenido del <li>
    let content = li.innerHTML;
    
    // Reemplazar <strong> tags - remover las etiquetas pero mantener el contenido
    content = content.replace(/<strong>(.*?)<\/strong>/g, '$1');
    
    // Reemplazar <br> con saltos de línea
    content = content.replace(/<br\s*\/?>/g, '\n');
    
    // Remover cualquier otra etiqueta HTML restante
    content = content.replace(/<[^>]*>/g, '');
    
    // Limpiar espacios extra y saltos de línea múltiples
    content = content.replace(/\n\s*\n/g, '\n').trim();
    
    plainText += content + '\n\n';
  });
  
  // Limpiar el resultado final
  return plainText.trim();
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
let multipleRecorders = []
let partialRecorderPause;
let transcrip 
// 1) Arranca ambos recorders

async function startRecordingAllMics() {



  try {
    // 1) Pide permiso global y luego lo libera
    const temp = await navigator.mediaDevices.getUserMedia({ audio: true });
    temp.getTracks().forEach(t => t.stop());

    // 2) Lista todos los micrófonos disponibles
    const devices = await navigator.mediaDevices.enumerateDevices();
    // 0) Conjunto para recordar qué groupId ya registramos
    const seenGroups = new Set();
    // 2) Lista todos los micrófonos disponibles
    const mics = devices.filter(d => d.kind === "audioinput" &&
      d.deviceId !== "default" &&
      d.deviceId !== "communications" &&
      !seenGroups.has(d.groupId) &&
      seenGroups.add(d.groupId)
    );



    // 3) Abre cada micrófono y recoge su pista en un array
    console.log(`🎤 Iniciando procesamiento de ${mics.length} micrófonos encontrados`);

    const tracks = await Promise.all(
      mics.map(async (mic, index) => {
        console.log(`\n--- Procesando Micrófono ${index + 1} ---`);
        console.log(`ID del dispositivo: ${mic.deviceId}`);
        console.log(`Etiqueta: ${mic.label || 'Sin etiqueta'}`);
        console.log(`Tipo: ${mic.kind}`);

        //---------------LOGICA PARA AGREGAR MICROFONOS AL SELECT


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



    // Continuar con las pistas válidas
    // console.log(`🔄 Continuando con ${validTracks.length} pistas de audio válidas`);

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
    partialRecorderPause = new Recorder(mixGain, { numChannels: 1 });

    partialRecorderPause.record();

    btPause.addEventListener('click', () => {
      if (btPause.textContent.trim() == 'Reanudar') {
        console.log('--SE PAUSÓ--')
        btPause.classList.toggle('bcThird2')
        partialRecorderPause.stop();
        partialRecorderPause.exportWAV(async (blob) => {
          multipleRecorders.push(blob);  // Guardar fragmento grabado en el array

          // Continúa grabando el siguiente segmento
          partialRecorderPause.clear();

        });
      }
      else {
        console.log('--SE REANUDÓ--')
        partialRecorderPause = new Recorder(mixGain, { numChannels: 1 });
        partialRecorderPause.record();
      }
      // btReanude.classList.toggle('bcThird2')

    })

    // btReanude.addEventListener('click', () => {
    //   console.log('se apretó el botón de reanudar')

    //   btReanude.classList.toggle('bcThird2')
    //   btPause.classList.toggle('bcThird2')
    //   partialRecorderPause = new Recorder(mixGain, { numChannels: 1 });
    //   partialRecorderPause.record();
    // })

    fullRecorder.record();
    partialRecorder.record();
    partialRecorder3.record();

    // 10) Cada 10 segundos corta el chunk y lo envía
    //OIDOS B CADA 10 SEGUNDOS
    chunkTimer = setInterval(() => {
      //huhm
      if (myBoolean) {
        console.log('======OIDOS B======')
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
    //OIDOS A CADA 3 MINUTOS
    setInterval(async () => {
      //huhm
      if (myBoolean) {
        // Detenemos la grabación después de 2 minutos
        console.log("=======OIDOS A=======")
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
        console.log("=====CHECKLIST AUDIO====")
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
          transcrip += `-- ------\n${transcription}\n\n`;
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

// Une varios blobs WAV → 1 solo blob WAV (sin cabeceras duplicadas)
async function mergeWavBlobs(blobs) {
  // 1) Carga cada blob en memoria
  const arrays = await Promise.all(
    blobs.map(async b => new Uint8Array(await b.arrayBuffer()))
  );

  // 2) Usa la primera cabecera (44 bytes) como base
  const header = arrays[0].slice(0, 44);
  const pcmParts = arrays.map(a => a.slice(44));        // quita cabeceras
  const pcmLen = pcmParts.reduce((n, p) => n + p.length, 0); // bytes de audio
  const fileLen = 44 + pcmLen;

  // 3) Actualiza tamaños en la cabecera (little-endian)
  const view = new DataView(header.buffer);
  view.setUint32(4, fileLen - 8, true);  // ChunkSize  = archivo – 8
  view.setUint32(40, pcmLen, true);  // Subchunk2Size = solo PCM

  // 4) Concatena cabecera + PCM
  const out = new Uint8Array(fileLen);
  out.set(header, 0);
  let offset = 44;
  pcmParts.forEach(p => { out.set(p, offset); offset += p.length; });

  return new Blob([out], { type: 'audio/wav' });
}

// “Mock” minimal de Recorder.js basado en un blob ya existente
function makeBlobRecorder(blob) {
  return {
    // compatibilidad con tu exportWAV(cb)
    exportWAV: cb => cb(blob),
    // por si luego quieres acceder directo
    blob
  };
}

// Ejemplo de función para detener y descargar la mezcla completa:
// Función para detener y descargar la mezcla completa
// Función principal modificada
async function stopAndDownloadFull() {

  clearInterval(chunkTimer);

  // Detener la grabación de la pausa
  partialRecorderPause.stop();
  // Detener la grabación de los recorders previos
  fullRecorder.stop();
  partialRecorder.stop();

  // Exporta el fragmento grabado y lo guarda en el array
  partialRecorderPause.exportWAV(async (blob) => {
    multipleRecorders.push(blob);  // Guardar fragmento grabado en el array
    console.log('se hace push a multiple buffer, su tamaño es de: ' + multipleRecorders.length)

    // Continúa grabando el siguiente segmento
    partialRecorderPause.clear();
    if (multipleRecorders.length > 1) {
      console.log('se detecto que hay mas de un fragmento de audio----')
      // Unir todos los fragmentos grabados en un solo archivo (Blob)
      // const combinedBlob = new Blob(multipleRecorders, { type: 'audio/wav' });
      // // 1. Crear URL y <audio>
      // const url = URL.createObjectURL(combinedBlob);
      // const audio = new Audio(url);
      // audio.loop = false;              // opcional
      // await audio.play();               // necesita un gesto de usuario previo en la página

      // // 2. Capturar el stream de reproducción
      // const combinedStream = audio.captureStream();

      // // 3. Usar ese stream como fuente del nuevo Recorder
      // fullRecorder = new Recorder(
      //   audioCtx.createMediaStreamSource(combinedStream),
      //   { numChannels: 1 }
      // );
      // fullRecorder.record();


      // ① Une los trozos SIN esperar 5 s
      const mergedBlob = await mergeWavBlobs(multipleRecorders);

      // ② “Guárdalo” en fullRecorder con la misma API que usas después
      fullRecorder = makeBlobRecorder(mergedBlob);

    }

    //-----------------------------------
    // Exportar el archivo WAV completo (audio de 0 a 4 minutos)
    fullRecorder.exportWAV(async (fullBlob) => {
      console.log('holassss')
      const timestamp = new Date().toISOString();
      const filename = `session-full-${timestamp}.wav`;

      // Exportar la transcripción de la "segunda parte" (2:01 a 4:00)
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

          // Enviar la transcripción y el audio al servidor
          await uploadTranscriptionAndAudio(mainTranscription, fullBlob, timestamp);

        } catch (err) {
          console.error('Falló la transcripción:', err);
          // Si falla la transcripción, subir solo el audio
          await uploadAudioOnly(fullBlob, timestamp);
        }
      });
    });
    //--------------------------------------------
  });






}

// Función para subir transcripción y audio
async function uploadTranscriptionAndAudio(transcriptionContent, audioBlob, timestamp) {
  MY_STATUS_SYSTEM += '\n--- ESTADO DE ENTREGABLES ---\n';

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
    addSystemMessage2('✅ Audio subido a la carpeta de Drive')
    MY_STATUS_SYSTEM += `Audio session-full-${timestamp}.wav subido exitosamente\n\n`;

    return true;

  } catch (error) {
    console.error('❌ Error subiendo archivo de audio:', error);
    addSystemMessage2('❌ Error subiendo archivo de audio a la carpeta de Drive: ' + error)
    MY_STATUS_SYSTEM += `Error al subir el audio session-full-${timestamp}.wav : ${error}\n\n`;

    return false;
  }
}
//karen
// Función para subir archivos de texto (modificada de tu función original)
async function uploadAllFilesWithTranscription(transcriptionContent, timestamp) {
  try {
    console.log('📤 Iniciando subida de archivos de texto...');
    addSystemMessage2('📤 Procesando la subida de archivos de Textos...')
    // Definir los archivos a procesar
    // Utilidad para formatear la fecha como dd-mm-yyyy
    const today = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const date = `${pad(today.getDate())}-${pad(today.getMonth() + 1)}-${today.getFullYear()}`;

    const fileConfigs = [
      { url: '/download_log', filename: `A_Eye_${date}.txt` },
      { url: '/download_screen', filename: `B_Eye_${date}.txt` },
      { url: '/download_audio_b', filename: `B_Ear_${date}.txt` },
      { url: '/download_eye_c', filename: `C_Eye_${date}.txt` }
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
        // addSystemMessage2(`✅ Contenido obtenido y listo para subirse: ${config.filename}`)
      } catch (error) {
        console.error(`❌ Error obteniendo ${config.filename}:`, error);
        renderMessage2(`❌ Error obteniendo ${config.filename}:` + error)
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
          entregables.archivosGenerados++
          entregables.names.push(file.filename)
          console.log(`✅ ${file.filename} - Subido exitosamente`);
          addSystemMessage2(`✅ ${file.filename} - Subido exitosamente`)
        } else {
          console.error(`❌ ${file.filename} - Error: ${file.error}`);
          addSystemMessage2(`❌ ${file.filename} - Error: ${file.error}`)
          entregables.erroresGeneracion.push(file.filename)
          entregables.errorDetails.push(file.error)
        }
      });

      MY_STATUS_SYSTEM += `\n Exitosos: ${entregables.archivosGenerados} ( ${entregables.names.join(', ')} )\n`
      MY_STATUS_SYSTEM += ` Fallidos: ${entregables.erroresGeneracion.length} ( ${entregables.erroresGeneracion.join(', ')} ) \n`

      MY_STATUS_SYSTEM += '\n--- REGISTRO DE ERRORES ---\n';
      MY_STATUS_SYSTEM += `\n  ( ${entregables.errorDetails.join('\n\n')} )`

        MY_STATUS_SYSTEM += '\n\n----------------------PUNTOS PENDIENTES DE AGENDA---------------------\n\n'
        if(MY_LAST_CHECKLIST == ''){
          MY_LAST_CHECKLIST = MY_CHECKLIST
        }
        MY_LAST_CHECKLIST = htmlToPlainText(MY_LAST_CHECKLIST)
  MY_STATUS_SYSTEM += `\n ${MY_LAST_CHECKLIST} \n`
      //downloadStatus()
      upload_Status()
      // Mostrar confirmación final
      //showUploadSuccess(result, timestamp);

    } else {
      throw new Error(result.error || 'Error desconocido en la subida');
    }

  } catch (error) {
    console.error('❌ Error en subida de archivos:', error);
    alert('Hubo un error al subir los archivos: ' + error.message);
  }
}

function downloadStatus(){
 // 1. Crear un blob de tipo texto
 const blob = new Blob([MY_STATUS_SYSTEM], { type: 'text/plain;charset=utf-8' });

 // 2. Generar una URL temporal para ese blob
 const url = URL.createObjectURL(blob);

 // 3. Crear (o reutilizar) un enlace oculto con el atributo download
 const link = document.createElement('a');
 link.href = url;
 link.download = 'status.txt';          // nombre del archivo
 document.body.appendChild(link);       // requerido en Firefox

 // 4. Simular clic para iniciar la descarga
 link.click();

 // 5. Limpieza
 document.body.removeChild(link);       // opcional: quitar el enlace
 URL.revokeObjectURL(url);              // liberar la URL temporal

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
  addSystemMessage2('📤 Procesando archivos...')

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
// 1) Variables de módulo para no perder la referencia
let currentStream = null;   // MediaStream activo
let captureTimer1 = null;   // interval IDs
let captureTimer2 = null;
const video = document.getElementById('myDivScreen');


// 3) Función para detener TODO lo anterior
function stopScreenShare() {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());  // libera cámara
    currentStream = null;
  }
  clearInterval(captureTimer1);
  clearInterval(captureTimer2);
  video.srcObject = null;
}
const myBtChangeWindow = document.getElementById('btChangeWindow')


async function startScreenShare() {
  try {
    const containerScreen = document.getElementById('containerScreen')
    console.log('hola')
    // Detén la sesión y temporizadores previos
    stopScreenShare();
    // Solicitar permiso y capturar la pantalla
    currentStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: false
    });
    video.autoplay = true;
    video.muted = true;
    video.srcObject = currentStream;


    containerScreen.appendChild(video)

    myBtChangeWindow.addEventListener('click', () => {
      console.log('holis')
      // stopScreenShare(stream)
      startScreenShare()
    })

    // Crear un canvas para capturar frames
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    });

    //OJOS B cada 10 segundos
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
            console.log('======OJOS B=====');

          const response = await fetch('/upload_frame', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image: currentFrame })
          });

          if (!response.ok) {
            console.error('Error enviando frame al servidor');
          } else {
            console.log('Frame enviado con éxito:' , response.json());
          }
        } catch (error) {
          console.error('Error en fetch:', error);
        }


      }
    }
  //Checklit con imagen cada 1.5 minutos
    async function captureAndSendFrame2() {
      if (video.videoWidth && video.videoHeight) {
        console.log('======Cheklist Imagen======');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        currentFrame = canvas.toDataURL('image/png');

        // Enviar el frame al servidor Flask

        //huhm
        // Convertir canvas a blob en lugar de string base64
        canvas.toBlob(async (blob) => {
          try {
            console.log('contenido del checklist para su analisis: ', MY_CHECKLIST)
            console.log('ejecutando fetch 2...')
            const form = new FormData();
            form.append("img", blob, "image.png"); // Enviar como blob, no como string base64
            form.append("status", "2"); // Enviar como string para estar seguro
            form.append("checklist", MY_CHECKLIST)
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
             // console.log('Contenido completo:', data);
              console.log('Resultado del análisis - RESUMEN:', data.result);
              renderMessage5(data.result)
              MY_LAST_CHECKLIST = data.result
              // const divImportant = document.getElementById('divImportant')
              // const newDiv = document.createElement('div')
              // newDiv.className = 'w90  fShrink0 hAuto taCenter dFlex aiCenter jcCenter bsBorderBox p10 bcThirdLight ff2 fs1 br5px'
              // newDiv.textContent = `${horaActual} - ${data.result}`
              // divImportant.appendChild(newDiv)
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
    // Vuelve a arrancar los intervalos UNA sola vez
    captureTimer1 = setInterval(captureAndSendFrame, 10 * 1000);
    captureTimer2 = setInterval(captureAndSendFrame2, 1.5 * 60 * 1000);


  } catch (err) {
    console.error("Error al capturar pantalla: ", err);
  }
}




// ----------------- L O G I C A    P A R A    G R A B A R    L A S     C A M A R A S ----------------

async function listAndShowCams() {
  const camsContainer = document.getElementById('cameras-panel');


  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (e) {
    console.warn("Permiso de cámara denegado o no disponible.", e);
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter(device => device.kind === 'videoinput');
  ;const test_camera = document.getElementById('test-camera')
  test_camera.style.display='none'
  console.log('cams: ' + videoInputs)
  // Array para almacenar objetos con video y canvas para cada cámara
  const activeCams = [];

  // Objeto para mapear deviceId con los elementos de la cámara
  const cameraElements = {};
  for (let i = 0; i < videoInputs.length; i++) {
    const device = videoInputs[i];

    try {


      //--------------parte para el menu de camaras:

      //------------------------------
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: device.deviceId } },
        audio: false
      });
      //  <div class="bg-black rounded-lg aspect-square">
      //       <h3 class="text-xs text-white p-2 font-medium">Cámara Sala</h3>
      //       <img src="https://placehold.co/300x300/000000/ffffff?text=Sala" alt="Vista de la cámara de la sala" class="w-full h-auto object-cover rounded-b-lg">
      //   </div>
      const camBox = document.createElement('div');
      camBox.className = 'bg-black rounded-lg relative aspect-video';

      const title = document.createElement('h3');
      title.textContent = `${device.label}`;
      title.className = 'absolute top-1 left-2 text-xs text-white p-1 font-medium bg-black/30 rounded'
      camBox.appendChild(title);


      const video = document.createElement('video');
      video.className = 'w-full h-full object-cover rounded-lg'
      video.id = `myCamera${i + 1}`
      video.autoplay = true;
      video.playsInline = true;
      video.width = 300;
      video.height = 300;
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

    console.log('=====OJOS A y OJOS C======');

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
  setInterval(captureAndSendFrames, 1 * 60 * 1000);
}


const myStartBt = document.getElementById('startAll')

myStartBt.addEventListener('click', () => {
  // myStartBt.disabled = true;
  // btPause.disabled = false
  // btReanude.disabled = false
  // btChangeWindow.disabled = false
  // downloadAll.disabled = false
  // btPause.classList.toggle('bcThird2')
  // myStartBt.classList.toggle('bcThird2')
  // myBtChangeWindow.classList.toggle('bcThird2')
  // downloadAll.classList.toggle('bcThird2')
  startRecordingAllMics();
  listAndShowCams();

  startScreenShare();

})



async function extra_config() {
  console.log('-----------------Extra config  1--------------------')
  try {
    MY_STATUS_SYSTEM += '\n--- DIAGNÓSTICO DE HARDWARE ---\n';
    // MY_STATUS_SYSTEM += '\n--- Dispositivos de audio detectados: ---\n\n';

    // 1) Pide permiso global y luego lo libera
    const temp = await navigator.mediaDevices.getUserMedia({ audio: true });
    temp.getTracks().forEach(t => t.stop());
    // 0) Conjunto para recordar qué groupId ya registramos
    const seenGroups = new Set();
    // 2) Lista todos los micrófonos disponibles
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === "audioinput" &&
      d.deviceId !== "default" &&
      d.deviceId !== "communications" &&
      !seenGroups.has(d.groupId) &&
      seenGroups.add(d.groupId)
    );



    const myDivAudio = document.getElementById('dropdown-audio');
    // <p class="px-3 py-2 text-sm text-mc-gray-light font-bold">Dispositivos de Audio</p>
    const myP = document.createElement('p')
    myP.className = 'px-3 py-2 text-sm text-mc-gray-light font-bold'
    myP.innerHTML = 'Dispositivos de Audio'
    myDivAudio.appendChild(myP)

    const tracks = await Promise.all(
      mics.map(async (mic, index) => {


        const option = document.createElement('a');
        option.className = 'cPointer audio-device-item is-active flex justify-between items-center text-white px-3 py-2 text-sm rounded-md hover:bg-mc-blue-panel'
        option.setAttribute('data-value', index + 1)
        option.id = `myAudio${index + 1}`
        const mySpan = document.createElement('span')
        mySpan.innerHTML = mic.label
        console.log(mic.label)
        MY_STATUS_SYSTEM += `${mic.label} \n\n`

        option.appendChild(mySpan)

        const newDiv = document.createElement('div')
        newDiv.className = 'audio-visualizer flex items-center justify-center h-4 w-10 gap-px'

        option.addEventListener('click', () => {
          //option.classList.toggle('select');
          addSystemMessage2(`Fuente de audio cambiada a: ${mic.label}.`);

          console.log(`🖱️ Click en micrófono ${index + 1}, estado select:`, option.classList.contains('select'));
        });


        option.appendChild(newDiv)
        myDivAudio.appendChild(option)








      })
    );

  }
  catch (err) {
    console.log(err)
  }
}

async function extra_config_2() {

  console.log('-----------------Extra config  2--------------------')
  // MY_STATUS_SYSTEM += '\n--- Dispositivos de video detectados: ---\n\n';

  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (e) {
    console.warn("Permiso de cámara denegado o no disponible.", e);
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter(device => device.kind === 'videoinput');

  // <p class="px-3 py-2 text-sm text-mc-gray-light font-bold">Dispositivos de Video</p>
  const myDivVideo = document.getElementById('dropdown-video')
  const myP = document.createElement('p')
  myP.innerHTML = 'Dispositivos de Video'
  myP.className = 'px-3 py-2 text-sm text-mc-gray-light font-bold'
  myDivVideo.appendChild(myP)

  for (let i = 0; i < videoInputs.length; i++) {
    const device = videoInputs[i];

    try {

      // <a href="#" class="video-device-item flex justify-between items-center text-white px-3 py-2 text-sm rounded-md hover:bg-mc-blue-panel"><span>Integrated Webcam</span><span class="h-2 w-2 rounded-full bg-green-500"></span></a>
      //--------------parte para el menu de camaras:
      const option = document.createElement('a');
      option.className = 'cPointer video-device-item flex justify-between items-center text-white px-3 py-2 text-sm rounded-md hover:bg-mc-blue-panel'
      option.setAttribute('data-value', i + 1)
      option.id = `myVideo${device.deviceId}`

      const mySpan = document.createElement('span')
      mySpan.innerHTML = device.label

      MY_STATUS_SYSTEM += `${device.label} \n\n`
console.log(device.label)
      const mySpan2 = document.createElement('span')
      mySpan2.className = 'h-2 w-2 rounded-full bg-green-500'

      option.appendChild(mySpan)
      option.appendChild(mySpan2)

      option.addEventListener('click', () => {
        addSystemMessage2(`Fuente de video cambiada a: ${device.label}.`);

      })

      myDivVideo.appendChild(option)

      // option.title = `ID: ${device.deviceId}`; // Tooltip



    } catch (err) {
      console.warn(`No se pudo acceder a la cámara ${device.label}:`, err);
    }
  }

}

function addSystemMessage2(text) {
  // console.log('----funcion 2----')
  renderMessage2({ sender: 'ai', text: text });
}

function renderMessage2(message) {
  const messageContainer = document.getElementById('message-container');

  const wrapper = document.createElement('div');
  wrapper.className = `flex items-start gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`;

  const bubble = document.createElement('div');
  bubble.className = `max-w-xs p-3 rounded-lg text-sm ${message.sender === 'user' ? 'bg-mc-blue-dark text-white' : 'bg-chat-light text-mc-blue-dark border border-gray-200'}`;

  if (message.isCheck) {
    bubble.innerHTML = `<div id="${message.checkId}" class="flex items-center gap-2"><svg class="animate-spin h-5 w-5 text-mc-yellow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>${message.text}</span></div>`;
  } else {
    bubble.innerHTML = `<p>${message.text}</p>`;
  }

  if (message.options) {
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'mt-3 flex flex-wrap gap-2';
    message.options.forEach(opt => {
      const button = document.createElement('button');
      button.textContent = opt.text;
      button.className = 'bg-transparent border border-mc-yellow text-mc-yellow font-semibold py-1 px-3 rounded-md text-sm hover:bg-mc-yellow hover:text-black transition-all';
      button.onclick = () => {
        handleAction(opt.action);
        optionsContainer.querySelectorAll('button').forEach(btn => {
          btn.disabled = true;
          btn.classList.add('opacity-50');
        });
      };
      optionsContainer.appendChild(button);
    });
    bubble.appendChild(optionsContainer);
  }

  wrapper.appendChild(bubble);
  messageContainer.appendChild(wrapper);
  messageContainer.scrollTop = messageContainer.scrollHeight;
}

function renderMessage5(message) {
  // --- contenedor externo (alineación) -------------------------------
  const wrapper = document.createElement('div');
  wrapper.className = `flex items-start gap-3  justify-start
  `;

  // --- “burbuja” de chat --------------------------------------------
  const bubble = document.createElement('div');
  bubble.className =
    `max-w-xs p-3 rounded-lg text-sm bg-chat-light text-mc-blue-dark border border-gray-200`

  
    // 3) Texto simple
    bubble.innerHTML = `${message}`;
  

 
  // --- insertar en DOM y hacer scroll -------------------------------
  wrapper.appendChild(bubble);
  document.getElementById('message-container').appendChild(wrapper);
  document.getElementById('message-container').scrollTop = document.getElementById('message-container').scrollHeight;
}

// Función para generar y concatenar el reporte básico
function generateStatusReport() {
  console.log('-----------------generar reporte--------------------')

  const now = new Date();
  
  // Obtener información básica del sistema
  const systemInfo = {
      timestamp: now.toISOString(),
      fecha: now.toLocaleDateString('es-MX'),
      hora: now.toLocaleTimeString('es-MX'),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      onlineStatus: navigator.onLine ? 'Conectado' : 'Sin conexión'
  };

  // Información de la ventana/pantalla
  const displayInfo = {
      screenWidth: screen.width,
      screenHeight: screen.height,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      colorDepth: screen.colorDepth,
      pixelRatio: window.devicePixelRatio
  };

  // Generar el contenido del reporte
  let reportContent = '';
  
  reportContent += '='.repeat(60) + '\n';
  reportContent += '           REPORTE DE ESTADO DEL SISTEMA\n';
  reportContent += '='.repeat(60) + '\n';
  reportContent += `Generado: ${systemInfo.fecha} a las ${systemInfo.hora}\n`;
  reportContent += `Timestamp: ${systemInfo.timestamp}\n\n`;
  
  reportContent += '--- INFORMACIÓN DEL SISTEMA ---\n';
  reportContent += `Estado de conexión: ${systemInfo.onlineStatus}\n`;
  reportContent += `Idioma del navegador: ${systemInfo.language}\n`;
  reportContent += `Plataforma: ${systemInfo.platform}\n`;
  reportContent += `Cookies habilitadas: ${systemInfo.cookiesEnabled ? 'Sí' : 'No'}\n`;
  reportContent += `User Agent: ${systemInfo.userAgent}\n\n`;
  
  reportContent += '--- INFORMACIÓN DE PANTALLA ---\n';
  reportContent += `Resolución de pantalla: ${displayInfo.screenWidth}x${displayInfo.screenHeight}\n`;
  reportContent += `Tamaño de ventana: ${displayInfo.windowWidth}x${displayInfo.windowHeight}\n`;
  reportContent += `Profundidad de color: ${displayInfo.colorDepth} bits\n`;
  reportContent += `Ratio de píxeles: ${displayInfo.pixelRatio}\n\n`;
  
  reportContent += '--- ESTADO DE APIS DEL NAVEGADOR ---\n';
  reportContent += `Geolocalización: ${navigator.geolocation ? 'Disponible' : 'No disponible'}\n`;
  reportContent += `getUserMedia: ${navigator.mediaDevices ? 'Disponible' : 'No disponible'}\n`;
  reportContent += `Local Storage: ${typeof(Storage) !== 'undefined' ? 'Disponible' : 'No disponible'}\n`;
  reportContent += `Service Workers: ${navigator.serviceWorker ? 'Disponible' : 'No disponible'}\n`;
  reportContent += `Notifications: ${window.Notification ? 'Disponible' : 'No disponible'}\n\n`;
  
  // Concatenar al MY_STATUS_SYSTEM
  MY_STATUS_SYSTEM += reportContent;
  console.log(MY_STATUS_SYSTEM)
  return reportContent;
}

generateStatusReport()


extra_config()
extra_config_2()



function test_console(text){

  console.log(text)
}




