import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { X, Camera as CameraIcon, RefreshCcw, Zap, ZapOff, Ratio, Video, Square, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { App } from '@capacitor/app';

// Fila global de operações da câmera para evitar race conditions no hardware
let cameraQueue = Promise.resolve();

// Helper para evitar que operações travem a fila eternamente
const runWithTimeout = (promise, ms = 3000) => {
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => {
//             console.warn(`Camera operation timed out after ${ms}ms`);
            resolve(); // Resolvemos para não quebrar a cadeia, apenas ignoramos o travamento
        }, ms))
    ]);
};

const CameraCapture = ({ onCapture, onClose, initialMode = 'photo' }) => {
  const [mode, setMode] = useState(initialMode); // 'photo' | 'video'
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef(null);

  const [isFlashOn, setIsFlashOn] = useState(() => {
    return localStorage.getItem('cameraFlashMode') === 'on';
  });
  const [isReady, setIsReady] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(() => {
    return localStorage.getItem('cameraAspectRatio') || '9:16';
  }); // '9:16' or '3:4'

  const onCloseRef = useRef(onClose);
  
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Effect 1: Gerenciar visibilidade global da UI (mount/unmount)
  useEffect(() => {
    // Esconder UI do app para mostrar a câmera
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    const root = document.getElementById('root');
    if (root) root.style.display = 'none';

    // Gerenciar botão de voltar do Android
    let backButtonListener;
    const setupBackButton = async () => {
      try {
//         console.log('Configurando listener do backButton no CameraCapture');
        backButtonListener = await App.addListener('backButton', async () => {
//            console.log('BackButton pressionado no CameraCapture');
           
           // Tentar parar a câmera nativa explicitamente para garantir liberação
           try {
             await CameraPreview.stop();
           } catch(e) {
//              console.warn('Erro ao parar camera via back button:', e);
           }
           
           if (onCloseRef.current) {
             onCloseRef.current();
           }
        });
      } catch (e) {
//         console.warn('Erro ao configurar back button listener:', e);
      }
    };
    setupBackButton();

    return () => {
      // Restaurar UI do app ao fechar câmera
      document.documentElement.style.background = '';
      document.body.style.background = '';
      const root = document.getElementById('root');
      if (root) root.style.display = '';

      // Remover listener
      if (backButtonListener) {
        backButtonListener.remove();
      }
    };
  }, []); // Executar apenas na montagem/desmontagem

  // Effect 2: Gerenciar ciclo de vida da câmera e trocas de proporção
  useEffect(() => {
    let mounted = true;

    // Função interna de configuração
    const performConfiguration = async () => {
        if (!mounted) return;
        
        // Mostrar tela preta durante configuração
        setIsReady(false);

        try {
          // 0. Solicitar permissões explicitamente (Câmera e Microfone)
          try {
             const permissions = await Camera.requestPermissions({ permissions: ['camera', 'microphone'] });
             if (permissions.camera !== 'granted' || permissions.microphone !== 'granted') {
                 // Se o usuário negou, avisamos mas tentamos continuar (o plugin pode falhar depois)
//                  console.warn('Permissões de câmera/microfone não foram totalmente concedidas');
             }
          } catch (e) {
//              console.warn('Erro ao solicitar permissões via Capacitor Camera:', e);
          }

          // 1. Stop forçado e seguro
          try {
             await CameraPreview.stop();
          } catch (e) {
             // Ignorar erro de stop se já estiver parado
          }

          // 2. Delay obrigatório para limpeza do hardware (Android precisa disso)
          await new Promise(resolve => setTimeout(resolve, 500));

          if (!mounted) return;

          // 3. Calcular dimensões
          const screenW = window.screen.width;
          const screenH = window.screen.height;
          
          let targetHeight;
          if (aspectRatio === '9:16') {
            targetHeight = Math.round(screenW * (16/9));
          } else {
            // 3:4
            targetHeight = Math.round(screenW * (4/3));
          }

          const y = Math.max(0, Math.round((screenH - targetHeight) / 2));
          
          // 4. Iniciar Câmera
          await CameraPreview.start({
            position: 'rear',
            toBack: true,
            x: 0,
            y: y,
            width: screenW,
            height: targetHeight,
            paddingBottom: 0,
            rotateWhenOrientationChanged: true,
            lockAndroidOrientation: false,
            enableZoom: true,
            disableExifHeaderStripping: true
          });

          // Hack para garantir que o WebView receba eventos de input (back button) após o start da câmera
          try {
            window.focus();
          } catch (e) {
//             console.warn('Erro ao focar window:', e);
          }

          // 5. Restaurar Flash
          try {
             const savedFlash = localStorage.getItem('cameraFlashMode') === 'on' ? 'on' : 'off';
             await CameraPreview.setFlashMode({ flashMode: savedFlash });
          } catch (e) {
//              console.warn('Failed to restore flash mode', e);
          }

          if (mounted) setIsReady(true);
        } catch (e) {
          console.error('Failed to start camera preview', e);
          if (mounted) {
              alert('Erro ao iniciar câmera. Tente novamente.');
              onClose();
          }
        }
    };

    // Enfileirar a operação de start na fila global com timeout de segurança
    cameraQueue = cameraQueue.then(() => runWithTimeout(performConfiguration(), 5000)).catch(e => console.error('Queue error:', e));

    return () => {
      mounted = false;
      // Enfileirar a operação de stop na fila global com timeout
      cameraQueue = cameraQueue.then(() => runWithTimeout(
          (async () => {
              try {
                  await CameraPreview.stop();
              } catch (e) {
//                   console.warn('Error stopping camera:', e);
              }
          })(), 
          2000
      )).catch(e => console.error('Queue cleanup error:', e));
    };
  }, [aspectRatio, onClose]);

  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRecordToggle = async () => {
    if (isRecording) {
      // Stop recording
      try {
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        
        // Pequeno delay para garantir que o último frame foi gravado
        await new Promise(r => setTimeout(r, 200));
        
        const result = await CameraPreview.stopRecordVideo();
        setIsRecording(false);
        
        if (result && result.videoFilePath) {
           onCapture({ 
             type: 'video', 
             path: result.videoFilePath, 
             duration: recordingTime 
           });
        } else {
            throw new Error("Nenhum arquivo retornado");
        }
      } catch (e) {
        console.error('Stop recording failed', e);
        setIsRecording(false);
        alert('Erro ao parar gravação.');
      }
    } else {
      // Start recording
      try {
        // Restaurando resolução padrão HD (720p)
        // Agora que temos a permissão de áudio, devemos usar uma resolução padrão segura
        // para evitar que o encoder tente usar dimensões quebradas do preview (ex: 393x851)
        await CameraPreview.startRecordVideo({
            position: 'rear',
            width: 1280,
            height: 720,
            withFlash: isFlashOn
        });
        
        setIsRecording(true);
        setRecordingTime(0);
        recordingTimerRef.current = setInterval(() => {
            setRecordingTime(prev => prev + 1);
        }, 1000);
        
      } catch (e) {
        console.error('Start recording failed', e);
        // Feedback mais detalhado para o usuário
        alert(`Erro ao iniciar gravação: ${e.message || 'Verifique permissões de câmera/áudio'}`);
      }
    }
  };

  useEffect(() => {
    if (isRecording && recordingTime >= 180) {
        handleRecordToggle();
        alert('O vídeo atingiu o limite máximo de 3 minutos.');
    }
  }, [recordingTime, isRecording]);

  const handleCapture = async () => {
    if (mode === 'video') {
        handleRecordToggle();
        return;
    }

    if (isCapturing) return;
    setIsCapturing(true);

    // Timeout de segurança para não travar UI se o plugin falhar
    const timeoutId = setTimeout(() => {
        if (isCapturing) {
            setIsCapturing(false);
            alert('A câmera demorou para responder. Tente novamente.');
        }
    }, 5000); // Reduzido para 5s para feedback mais rápido

    try {
      // Garantir flash mode antes da captura
      if (isFlashOn) {
         try {
            await CameraPreview.setFlashMode({ flashMode: 'on' });
         } catch(e) {}
      }

      // Usar qualidade 85 e dimensões baseadas na tela para consistência
      // NÃO passar width/height para o capture para ver se o plugin respeita a orientação melhor
      // Ou passar dimensões calculadas.
      
      const result = await CameraPreview.capture({
        quality: 85
      });

      clearTimeout(timeoutId);

      if (result && result.value) {
        // Processar rotação e corte
        const processedBase64 = await processCapturedImage(result.value);
        
        // Delay de resfriamento para evitar que o stop (que virá a seguir quando o componente desmontar)
        // atropele o final do processamento interno do hardware
        await new Promise(r => setTimeout(r, 500));
        
        onCapture(processedBase64);
      } else {
        throw new Error('Capture returned no data');
      }
    } catch (e) {
      clearTimeout(timeoutId);
      console.error('Capture failed', e);
      alert('Erro ao tirar foto. Tente novamente.');
    } finally {
      setIsCapturing(false);
    }
  };

  const processCapturedImage = (base64) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Determinar orientação
        let width = img.width;
        let height = img.height;
        
        // Se a imagem vier deitada (landscape) mas estamos em modo retrato
        // Rotacionar 90 graus
        const isLandscape = width > height;
        const shouldRotate = isLandscape && window.screen.height > window.screen.width; // Assumindo app em portrait

        if (shouldRotate) {
          canvas.width = height;
          canvas.height = width;
          ctx.translate(height, 0);
          ctx.rotate(90 * Math.PI / 180);
          ctx.drawImage(img, 0, 0);
        } else {
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0);
        }

        // Aplicar Crop para o Aspect Ratio selecionado
        // Agora temos uma imagem "em pé" (canvas). 
        // Precisamos garantir que ela atenda ao ratio 9:16 ou 3:4.
        
        const currentRatio = aspectRatio === '9:16' ? 9/16 : 3/4;
        const imgRatio = canvas.width / canvas.height;

        // Se o ratio da imagem for diferente do desejado, cortar
        // Mas cuidado: se cortarmos demais, perdemos informação.
        // O preview mostrava o que? O preview tinha o tamanho targetHeight.
        
        // Vamos criar um segundo canvas para o crop final
        const finalCanvas = document.createElement('canvas');
        let finalW = canvas.width;
        let finalH = canvas.width / currentRatio;

        if (finalH > canvas.height) {
           // Se a altura calculada for maior que a imagem, limitamos pela altura
           finalH = canvas.height;
           finalW = finalH * currentRatio;
        }

        finalCanvas.width = finalW;
        finalCanvas.height = finalH;
        
        const finalCtx = finalCanvas.getContext('2d');
        
        // Centralizar o crop
        const offsetX = (canvas.width - finalW) / 2;
        const offsetY = (canvas.height - finalH) / 2;
        
        finalCtx.drawImage(
          canvas, 
          offsetX, offsetY, finalW, finalH, 
          0, 0, finalW, finalH
        );

        resolve(finalCanvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
      };
      
      img.src = `data:image/jpeg;base64,${base64}`;
    });
  };

  const toggleFlash = async () => {
    try {
      const nextState = !isFlashOn;
      const mode = nextState ? 'on' : 'off';
      await CameraPreview.setFlashMode({ flashMode: mode });
      setIsFlashOn(nextState);
      localStorage.setItem('cameraFlashMode', mode);
    } catch (e) {
//       console.warn('Flash not available', e);
    }
  };
  
  const flipCamera = async () => {
    try {
      await CameraPreview.flip();
    } catch (e) {
//       console.warn('Flip not available', e);
    }
  };

  const toggleRatio = () => {
    setAspectRatio(prev => {
      const newRatio = prev === '9:16' ? '3:4' : '9:16';
      localStorage.setItem('cameraAspectRatio', newRatio);
      return newRatio;
    });
  };

  // Calcular áreas de overlay (barras pretas)
  const screenW = window.screen.width;
  const screenH = window.screen.height;
  const targetH = aspectRatio === '9:16' ? Math.round(screenW * (16/9)) : Math.round(screenW * (4/3));
  const topBarH = Math.max(0, Math.floor((screenH - targetH) / 2));
  const bottomBarH = Math.max(0, Math.ceil((screenH - targetH) / 2));

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col pointer-events-auto">
      {/* Loading Overlay - Prevents white flash */}
      {!isReady && <div className="absolute inset-0 bg-black z-50" />}

      {/* Black Bars for Aspect Ratio masking */}
      {topBarH > 0 && (
        <div 
          className="absolute top-0 left-0 right-0 bg-black z-0" 
          style={{ height: `${topBarH}px` }}
        />
      )}
      {bottomBarH > 0 && (
        <div 
          className="absolute bottom-0 left-0 right-0 bg-black z-0" 
          style={{ height: `${bottomBarH}px` }}
        />
      )}

      {/* Controls Layer */}
      <div className="relative z-10 flex flex-col justify-between h-full p-6">
        {/* Top Bar */}
        <div className="flex justify-between items-start pt-safe-top">
           {isRecording ? (
             <div className="w-full flex justify-center pt-2">
                <div className="bg-red-500/80 px-4 py-1 rounded-full text-white font-mono font-bold animate-pulse">
                   {formatTime(recordingTime)}
                </div>
             </div>
           ) : (
             <>
               <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={onClose} 
                  className="text-white rounded-full bg-black/40 hover:bg-black/60 w-12 h-12 backdrop-blur-md"
               >
                  <X className="w-6 h-6" />
               </Button>
               
               <Button 
                  onClick={toggleRatio} 
                  className="text-white rounded-full bg-black/40 hover:bg-black/60 px-4 h-12 backdrop-blur-md font-medium"
               >
                  {aspectRatio}
               </Button>

               <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={toggleFlash} 
                  className="text-white rounded-full bg-black/40 hover:bg-black/60 w-12 h-12 backdrop-blur-md"
               >
                  {isFlashOn ? <Zap className="w-6 h-6 text-yellow-400" /> : <ZapOff className="w-6 h-6" />}
               </Button>
             </>
           )}
        </div>
        
        {/* Bottom Bar */}
        <div className="flex justify-center items-center gap-12 mb-8 pb-safe-bottom">
            {!isRecording && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={flipCamera} 
                  className="text-white rounded-full bg-black/40 hover:bg-black/60 w-12 h-12 backdrop-blur-md"
                >
                  <RefreshCcw className="w-6 h-6" />
               </Button>
            )}
        
            <button 
              onClick={handleCapture}
              disabled={isCapturing && mode === 'photo'}
              className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-transform shadow-lg backdrop-blur-sm 
                ${mode === 'video' ? 'border-red-500 bg-red-500/20' : 'border-white bg-white/20'}
                ${(isCapturing && mode === 'photo') ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}
              `}
            >
              {mode === 'photo' ? (
                 isCapturing ? (
                    <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                 ) : (
                    <div className="w-16 h-16 rounded-full bg-white" />
                 )
              ) : (
                 // Video Mode
                 isRecording ? (
                    <div className="w-8 h-8 rounded bg-red-500 animate-pulse" /> 
                 ) : (
                    <div className="w-16 h-16 rounded-full bg-red-500" />
                 )
              )}
            </button>
            
            {!isRecording && <div className="w-12" />} {/* Spacer */}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CameraCapture;
