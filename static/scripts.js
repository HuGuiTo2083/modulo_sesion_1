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
let fullRecorder, chunkRecorder, partialRecorder, partialRecorder2;
let chunkTimer;
let mainTranscription

// 1) Arranca ambos recorders

async function startRecordingAllMics() {
  const myHeader2 = document.getElementById('myHeader')
  const micSelector = document.createElement('select');
  micSelector.id = 'mic-selector';

  const myOption1 = document.createElement('option')
  myOption1.textContent= "Micrófonos"

  micSelector.appendChild(myOption1)

  try {
    // 1) Pide permiso global y luego lo libera
    const temp = await navigator.mediaDevices.getUserMedia({ audio: true });
    temp.getTracks().forEach(t => t.stop());

    // 2) Lista todos los micrófonos disponibles
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === "audioinput");

    // 3) Abre cada micrófono y recoge su pista en un array
    const tracks = await Promise.all(
      mics.map(async (mic, index) => {
        //---------------LOGICA PARA AGREGAR MICROFONOS AL SELECT
         const option = document.createElement('option');
      option.value = mic.deviceId;
      
      // Mostrar nombre del micrófono si está disponible
      if (mic.label) {
        option.textContent = `${mic.label} (Mic ${index + 1})`;
      } else {
        option.textContent = `Micrófono ${index + 1} (ID: ${mic.deviceId.slice(0, 10)}...)`;
      }
   micSelector.appendChild(option)
      //---------
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: mic.deviceId } }
        });
        return stream.getAudioTracks()[0];
      })
    );

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
    partialRecorder2  = new Recorder(mixGain, { numChannels: 1 });

    fullRecorder.record();
    partialRecorder.record();

    myHeader2.appendChild(micSelector)

    // 10) Cada 10 segundos corta el chunk y lo envía
    chunkTimer = setInterval(() => {
      //huhm
      if(myBoolean){
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
      if(myBoolean){
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
        // Opción A: hora local, formato HH:MM:SS
        const timeStr = now.toLocaleTimeString(); 
        mainTranscription += `------ ${timeStr} ------\n${transcription}\n\n`;
        // Crear el archivo de texto con la transcripción
        const txtBlob = new Blob([mainTranscription], { type: 'text/plain' });
        const txtUrl = URL.createObjectURL(txtBlob);

        const link = document.createElement('a');
        link.href = txtUrl;
        link.download = 'A_Ear.txt';
        document.body.appendChild(link);
        link.click();

        // Limpiar
        URL.revokeObjectURL(txtUrl);
        link.remove();

      } catch (err) {
        console.error('Falló la transcripción:', err);
      }
    });

    // Descargar el WAV completo (todo el audio grabado)
    const url = URL.createObjectURL(fullBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `session-full-${timestamp}.wav`; // Nombre del archivo para la descarga
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  });
}


// ------------------------------------------


// Evento del botón: detiene el recorder (dispara onstop)
document.getElementById('downloadAll').addEventListener('click', async () => {
  stopAndDownloadFull() //con esta llamada ya descarga como tal todo el audio de la sesión
  try {
       await downloadFile('/download_log',    'A_Eye.txt');
       await downloadFile('/download_screen', 'B_Eye.txt');
    //   //await downloadFile('/download_audio',  'recording.wav');
    await downloadFile('/download_audio_b', 'B_Ear.txt');
    await downloadFile('/download_eye_c', 'C_Eye.txt');
  } catch (e) {
    console.error('Descarga fallida:', e);
    alert('Hubo un error al descargar: ' + e.message);
  }
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
    const txtUrl  = URL.createObjectURL(txtBlob);
    const link    = document.createElement('a');
    link.href     = txtUrl;
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
            body: JSON.stringify({ image: currentFrame })
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
    
    // Ejecutar cada 5 segundos
    setInterval(captureAndSendFrame, 10 * 1000);

  } catch (err) {
    console.error("Error al capturar pantalla: ", err);
  }
}




// ----------------- L O G I C A    P A R A    G R A B A R    L A S     C A M A R A S ----------------

async function listAndShowCams() {
  const camsContainer = document.getElementById('cams');
   const myHeader = document.getElementById('myHeader')
 
   const option1 = document.createElement('option');
    option1.value = 0;
    option1.textContent = "Cámaras"
  
  const cameraSelector = document.createElement('select');
  cameraSelector.id = 'camera-selector';
  cameraSelector.style.padding = '5px';
  cameraSelector.style.fontSize = '16px';
  cameraSelector.appendChild(option1)


  

  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch(e) {
    console.warn("Permiso de cámara denegado o no disponible.", e);
    return;
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter(device => device.kind === 'videoinput');
  camsContainer.innerHTML = '';
console.log('cams: ' + videoInputs)
  // Array para almacenar objetos con video y canvas para cada cámara
  const activeCams = [];

  for (let i = 0; i < videoInputs.length; i++) {
    const device = videoInputs[i];

    try {

      //--------------parte para el menu de camaras:
const option = document.createElement('option');
    option.value = i+1;
    
    // Usar el nombre real si está disponible
    if (device.label) {
      option.textContent = `${device.label} (Cámara ${i + 1})`;
    } else {
      // Caso de respaldo (debería ser raro después del permiso)
      option.textContent = `Cámara ${i + 1} - ${device.deviceId.slice(0, 10)}`;
    }
    
    option.title = `ID: ${device.deviceId}`; // Tooltip
    
    cameraSelector.appendChild(option);
      //------------------------------
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: device.deviceId } },
        audio: false
      });

      const camBox = document.createElement('div');
      camBox.classList.add('camBox');

      const title = document.createElement('h3');
      title.textContent = `Cámara ${i + 1}: ${device.label || 'Sin nombre'}`;
      camBox.appendChild(title);

      const video = document.createElement('video');
      video.id = `myCamera${i+1}`
      video.autoplay = true;
      video.playsInline = true;
      video.width = 320;
      video.height = 240;
      video.srcObject = stream;
      camBox.appendChild(video);
     console.log('hola')
      camsContainer.appendChild(camBox);

      // Crear canvas para capturar frames
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      // No lo añadimos al DOM porque es solo para captura

      activeCams.push({ video, canvas, deviceId: device.deviceId });

    } catch (err) {
      console.warn(`No se pudo acceder a la cámara ${device.label}:`, err);
    }
    myHeader.appendChild(cameraSelector)
  }

  // Función para capturar y enviar frames
  async function captureAndSendFrames() {
    activeCams.forEach(async ({ video, canvas, deviceId }, index) => {
      if (video.readyState >= 2) { // HAVE_CURRENT_DATA
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameBase64 = canvas.toDataURL('image/jpeg'); // Base64 jpg

        // try {
        //   const response = await fetch('/upload_frame2', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //       deviceId,
        //       image: frameBase64
        //     })
        //   });
        //   if (!response.ok) {
        //     console.error(`Error enviando frame de cámara ${index + 1}`);
        //   } else {
        //     // Opcional: console.log(`Frame cámara ${index + 1} enviado`);
        //   }
        // } catch (error) {
        //   console.error(`Error en fetch para cámara ${index + 1}:`, error);
        // }
      }
    });
  }

  // Capturar y enviar cada 10 segundos
  setInterval(captureAndSendFrames, 1 * 60 * 1000);
}


const  myStartBt = document.getElementById('startAll')

myStartBt.addEventListener('click', ()=>{
  myStartBt.disabled = true;
  startRecordingAllMics();
  listAndShowCams();

startScreenShare();

})

