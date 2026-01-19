import React, { useState, useRef, lazy, Suspense, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Camera, Video, Trash2, MapPin, Image as ImageIcon, Film, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Capacitor } from '@capacitor/core';
import { Camera as CapacitorCamera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera';
import { App } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { VideoProcessor } from '@/plugins/VideoProcessor';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { FLORESTA_COORDS } from '@/config/mapConfig';
import VideoProcessorComponent from '@/components/VideoProcessor';
import CameraCapture from '@/components/CameraCapture';
import MediaViewer from '@/components/MediaViewer';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

// Componentes VideoThumbnail e VideoPlayer removidos - não são mais necessários
// Vídeos serão exibidos apenas como ícone simples sem preview

const ReportModal = ({ onClose, onSubmit }) => {
  const [formData, setFormData] = useState({ 
    title: '', 
    description: '', 
    category: '', 
    address: '', 
    location: null, 
    photos: [], 
    videos: [], 
    pole_number: '' 
  });
  const [errors, setErrors] = useState({});
  const { toast } = useToast();
  const { user } = useAuth();
  const photoGalleryInputRef = useRef(null);
  const photoCameraInputRef = useRef(null);
  const videoGalleryInputRef = useRef(null);
  const videoCameraInputRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState('photo');
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [isPhotoProcessing, setIsPhotoProcessing] = useState(false);
  const [photoProcessingProgress, setPhotoProcessingProgress] = useState(0);
  const [photoProcessingMessage, setPhotoProcessingMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState(null);
  const [viewingVideoIndex, setViewingVideoIndex] = useState(null);
  const uploadAbortControllerRef = useRef(null);
  const photoWorkerRef = useRef(null);

  // Referência para armazenar dados da foto capturada enquanto processa
  const pendingPhotoRef = useRef(null);
  // Flag para controlar processamento em background
  const isProcessingRef = useRef(false);
  // Flag para rastrear se componente está montado
  const isMountedRef = useRef(true);
  const isAddingVideoRef = useRef(false);
  
  // Atualizar flag de montagem
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Solicita a geolocalização ao montar o componente
    if (!navigator.geolocation) {
      const defaultLocation = { lat: FLORESTA_COORDS[0], lng: FLORESTA_COORDS[1] };
      setFormData(prev => ({ 
        ...prev, 
        location: prev.location || defaultLocation
      }));
      return;
    }

    const geoOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setFormData(prev => ({ 
          ...prev, 
          location: { lat: latitude, lng: longitude }
        }));
      },
      (error) => {
        const defaultLocation = { lat: FLORESTA_COORDS[0], lng: FLORESTA_COORDS[1] };
        setFormData(prev => ({ 
          ...prev, 
          location: prev.location || defaultLocation
        }));
      },
      geoOptions
    );
  }, []);

  // Cleanup de previews de imagens e vídeos quando o componente desmontar
  useEffect(() => {
    return () => {
      // Limpar todos os previews
      formData.photos.forEach(photo => {
        if (photo?.preview) {
          try {
          URL.revokeObjectURL(photo.preview);
          } catch (e) {
            console.error('Erro ao limpar preview de foto:', e);
          }
        }
      });
      
      // Resetar flags
      isProcessingRef.current = false;
      pendingPhotoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handler global de erros para evitar crash/reload - versão simplificada
  useEffect(() => {
    // 1. Verificar se existe uma foto pendente recuperada pelo App.jsx (Global State)
    const checkGlobalPendingPhoto = async () => {
      if (window.__PENDING_RESTORED_PHOTO__) {
        console.log('📦 Foto pendente encontrada no estado global (ReportModal montado)');
        const data = window.__PENDING_RESTORED_PHOTO__;
        
        // Limpar imediatamente para evitar processamento duplo
        window.__PENDING_RESTORED_PHOTO__ = null;
        
        try {
          // Normalizar dados
          let filePath = data.filePath;
          if (!filePath && data.path) filePath = data.path;
          if (!filePath && data.webPath) filePath = data.webPath;
          if (!filePath && data.originalPath) filePath = data.originalPath; // Novo fallback

          if (filePath) {
             // USAR PLACEHOLDER INICIALMENTE
             let previewUrl = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E";

             const timestamp = Date.now();
             
             // Gerar thumbnail seguro
             try {
                VideoProcessor.compressImage({
                  filePath: filePath,
                  maxWidth: 300,
                  maxHeight: 300,
                  quality: 'medium',
                  maxSizeMB: 1.0,
                  format: 'webp'
                }).then(result => {
                  if (result && result.outputPath) {
                    const thumbUrl = Capacitor.convertFileSrc(result.outputPath);
                    setFormData(prev => {
                       const newPhotos = prev.photos.map(p => 
                         p.nativePath === filePath ? { ...p, preview: thumbUrl } : p
                       );
                       return { ...prev, photos: newPhotos };
                    });
                  }
                }).catch(() => {});
             } catch (e) {}
             const fileName = `photo_restored_${timestamp}.jpg`;
             
             let fileSize = 0;
             try {
                if (Capacitor.isNativePlatform()) {
                  const stat = await Filesystem.stat({ path: filePath });
                  fileSize = stat.size;
                }
             } catch (e) {
                console.warn('Não foi possível obter tamanho do arquivo recuperado:', e);
             }

             setFormData(prev => ({
               ...prev,
               photos: [...prev.photos, {
                 file: null, // File null indica path nativo
                 name: fileName,
                 nativePath: filePath,
                 preview: previewUrl,
                 isRestored: true,
                 size: fileSize
               }]
             }));
             
             toast({ 
               title: '✅ Foto recuperada com sucesso!',
               description: 'A imagem foi restaurada após o reinício do app.',
               duration: 4000
             });
          }
        } catch (e) {
          console.error('Erro ao processar foto recuperada:', e);
          toast({ title: '⚠️ Erro ao recuperar foto', variant: 'destructive' });
        }
      }
    };
    
    // Pequeno delay para garantir que a renderização inicial ocorreu
    setTimeout(checkGlobalPendingPhoto, 500);

    // Listener para recuperação de estado após morte do app pelo sistema (OOM kill)
    // Mantemos este listener caso o componente já esteja montado (ex: rotação de tela ou pausa breve)
    let appListenerHandle = null;
    
    const setupAppListener = async () => {
      if (Capacitor.isNativePlatform()) {
        appListenerHandle = await App.addListener('appRestoredResult', async (data) => {
          console.log('🔄 App restaurado com resultado:', data);
          
          // Verificar se é um resultado do VideoProcessor ou Camera
          if ((data.pluginId === 'VideoProcessor' && data.methodName === 'capturePhoto') || 
              (data.pluginId === 'Camera' && (data.methodName === 'getPhoto' || data.methodName === 'pickImages'))) {
             
             if (data.success && data.data) {
               // Normalizar dados dependendo do plugin
               let filePath = data.data.filePath; // VideoProcessor
               
               // Se for da Camera plugin (fallback)
               if (!filePath && data.data.path) filePath = data.data.path;
               if (!filePath && data.data.webPath) filePath = data.data.webPath;
               
               if (filePath) {
                 // USAR PLACEHOLDER INICIALMENTE
                 let previewUrl = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E";

                 const timestamp = Date.now();
                 
                 // Tentar gerar thumbnail se o plugin estiver disponível
                 try {
                    VideoProcessor.compressImage({
                      filePath: filePath,
                      maxWidth: 300,
                      maxHeight: 300,
                      quality: 'medium',
                      maxSizeMB: 1.0,
                      format: 'jpeg'
                    }).then(result => {
                      if (result && result.outputPath) {
                        const thumbUrl = Capacitor.convertFileSrc(result.outputPath);
                        setFormData(prev => {
                           const newPhotos = prev.photos.map(p => 
                             p.nativePath === filePath ? { ...p, preview: thumbUrl } : p
                           );
                           return { ...prev, photos: newPhotos };
                        });
                      }
                    }).catch(() => {});
                 } catch (e) {}
                 const fileName = `photo_restored_${timestamp}.jpg`;
                 
                 let fileSize = 0;
                 try {
                    if (Capacitor.isNativePlatform()) {
                      const stat = await Filesystem.stat({ path: filePath });
                      fileSize = stat.size;
                    }
                 } catch (e) {
                    console.warn('Não foi possível obter tamanho do arquivo restaurado:', e);
                 }

                 setFormData(prev => ({
                   ...prev,
                   photos: [...prev.photos, {
                     file: null,
                     name: fileName,
                     nativePath: filePath,
                     preview: previewUrl,
                     size: fileSize
                   }]
                 }));
                 
                 toast({ title: '✅ Foto recuperada!' });
               }
             }
          }
        });
      }
    };
    
    setupAppListener();

    const handleError = (event) => {
      const isProcessing = isTakingPhoto || pendingPhotoRef.current || isProcessingRef.current;
      const errorMsg = event.error?.message || event.error?.toString() || '';
      const isFileError = errorMsg.includes('blob') || errorMsg.includes('URL') || errorMsg.includes('File') || errorMsg.includes('FileReader') || errorMsg.includes('Memory');
      
      // Capturar erros durante processamento de arquivo
      if (isProcessing || isFileError) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        console.error('🚫 Erro capturado (prevenindo reload):', event.error, {
          isProcessing,
          isFileError
        });
        
        // Tentar limpar estado problemático
        if (event.error?.message?.includes('memory') || event.error?.message?.includes('allocation') || isFileError) {
          console.warn('Erro de memória/arquivo detectado, limpando recursos...');
          // Forçar garbage collection se possível
          if (window.gc) {
            try {
              window.gc();
            } catch (e) {
              console.error('Erro ao forçar GC:', e);
            }
          }
        }
        
        // IMPORTANTE: Retornar false para prevenir reload
        return false;
      }
    };
    
    const handleUnhandledRejection = (event) => {
      const isProcessing = isTakingPhoto || pendingPhotoRef.current || isProcessingRef.current;
      const errorMsg = event.reason?.message || event.reason?.toString() || '';
      const isFileError = errorMsg.includes('blob') || errorMsg.includes('URL') || errorMsg.includes('File') || errorMsg.includes('FileReader') || errorMsg.includes('Memory');
      
      // Capturar rejeições durante processamento
      if (isProcessing || isFileError) {
        event.preventDefault();
        console.error('🚫 Promise rejeitada (prevenindo reload):', event.reason, {
          isProcessing,
          isFileError
        });
        
        // Resetar flags se necessário
        if (event.reason?.message?.includes('timeout') || event.reason?.message?.includes('cancel') || isFileError) {
          setTimeout(() => {
            try {
              isProcessingRef.current = false;
              pendingPhotoRef.current = null;
              setIsTakingPhoto(false);
            } catch (e) {
              console.error('Erro ao resetar flags:', e);
            }
          }, 100);
        }
        
        // IMPORTANTE: Retornar false para prevenir reload
        return false;
      }
    };
    
    // Handler adicional para prevenir reload da página
    const handleBeforeUnload = (event) => {
      try {
        // Verificar se está processando foto
        const isProcessing = isProcessingRef.current || pendingPhotoRef.current || isTakingPhoto;
        
        if (isProcessing) {
          // Prevenir reload de forma mais suave
          event.returnValue = ''; // Chrome requer returnValue
          console.warn('🚫 Tentativa de reload bloqueada durante processamento de foto');
          return ''; // Alguns navegadores requerem string vazia
        }
      } catch (e) {
        // Se houver erro, não bloquear
        console.error('Erro em handleBeforeUnload:', e);
      }
    };
    
    window.addEventListener('error', handleError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      if (appListenerHandle) {
        appListenerHandle.remove();
      }
      window.removeEventListener('error', handleError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isTakingPhoto]);

  const categories = [
    { id: 'iluminacao', name: 'Iluminação', icon: '💡' },
    { id: 'buracos', name: 'Buracos na Via', icon: '🕳️' },
    { id: 'esgoto', name: 'Esgoto Entupido', icon: '🚰' },
    { id: 'limpeza', name: 'Limpeza Urbana', icon: '🧹' },
    { id: 'poda', name: 'Poda de Árvore', icon: '🌳' },
    { id: 'vazamento-de-agua', name: 'Vazamento de Água', icon: '💧' },
    { id: 'outros', name: 'Outros', icon: '📍' }
  ];

  // FUNÇÃO CRÍTICA: Processamento otimizado para câmeras de alta resolução com limite de 10MB
  const processHighResolutionImage = async (base64String, fileName, overrideWidth, overrideHeight, overrideQuality) => {
    return new Promise((resolve, reject) => {
      // Timeout de segurança
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout no processamento de imagem'));
      }, 60000); // 60 segundos
      
      const img = new Image();
      let canvas = null;
      
      const cleanup = () => {
        clearTimeout(timeoutId);
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
          canvas = null;
        }
        img.src = '';
        img.onload = null;
        img.onerror = null;
      };
      
      img.onload = () => {
        try {
          console.log(`Imagem original: ${img.width}x${img.height}`);
          
          // Validar dimensões antes de processar
          if (!img.width || !img.height || img.width === 0 || img.height === 0) {
            cleanup();
            reject(new Error('Dimensões de imagem inválidas'));
            return;
          }
          
          // Detectar Ultra HD (4K/8K) para preservação de qualidade
          const is4K = img.width >= 3840 && img.height >= 2160;
          const is8K = img.width >= 7680 && img.height >= 4320;
          const isUltraHD = is4K || is8K;
          const isHighRes = img.width > 4000 || img.height > 3000;
          
          // Estratégia inteligente para manter qualidade com limite de 10MB
          let targetWidth, targetHeight, quality;
          
          // Calcular tamanho aproximado em MB antes de processar
          const sizeInBytes = (base64String.length * 3) / 4;
          const sizeInMB = sizeInBytes / (1024 * 1024);
          
          console.log(`Tamanho original estimado: ${sizeInMB.toFixed(2)}MB, Ultra HD: ${isUltraHD ? 'Sim' : 'Não'}`);
          
          if (overrideWidth && overrideHeight && overrideQuality) {
            targetWidth = overrideWidth;
            targetHeight = overrideHeight;
            quality = overrideQuality;
          } else 
          // Algoritmos de preservação de qualidade para Ultra HD
          if (isUltraHD) {
            // Para 4K/8K, usar estratégias conservadoras
            if (sizeInMB > 30) {
              // Ultra HD muito grande - compressão moderada
              targetWidth = is8K ? 3000 : 2500; // Manter resolução alta
              targetHeight = is8K ? 1688 : 1406;
              quality = is8K ? 0.8 : 0.85; // Qualidade alta para Ultra HD
            } else if (sizeInMB > 15) {
              // Ultra HD grande - compressão suave
              targetWidth = is8K ? 3500 : 3000;
              targetHeight = is8K ? 1970 : 1688;
              quality = is8K ? 0.85 : 0.9;
            } else {
              // Ultra HD pequeno - manter qualidade máxima
              targetWidth = is8K ? 4000 : 3500;
              targetHeight = is8K ? 2250 : 1970;
              quality = is8K ? 0.9 : 0.95;
            }
          } else if (sizeInMB > 20) {
            // Imagens muito grandes (>20MB) - compressão agressiva
            targetWidth = 1200;
            targetHeight = 900;
            quality = 0.6;
          } else if (sizeInMB > 10) {
            // Imagens grandes (>10MB) - compressão moderada
            targetWidth = 1600;
            targetHeight = 1200;
            quality = 0.7;
          } else if (isHighRes) {
            // Câmera 12MP+ - redimensionamento significativo
            targetWidth = 2000;
            targetHeight = 1500;
            quality = 0.8;
          } else {
            // Câmeras normais - qualidade máxima
            targetWidth = 2500;
            targetHeight = 1875;
            quality = 0.9;
          }
          
          // Calcular dimensões mantendo proporção
          const ratio = Math.min(targetWidth / img.width, targetHeight / img.height);
          const width = Math.floor(img.width * ratio);
          const height = Math.floor(img.height * ratio);
          
          console.log(`Imagem redimensionada: ${width}x${height}, qualidade: ${quality}, Ultra HD: ${isUltraHD}`);
          
          canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            cleanup();
            reject(new Error('Não foi possível criar contexto do canvas'));
            return;
          }
          
          // Configurações de performance para qualidade máxima
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // Desenhar imagem redimensionada
          ctx.drawImage(img, 0, 0, width, height);
          
          // Função para tentar diferentes níveis de compressão até atingir 10MB
          const tryCompression = (currentQuality) => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  cleanup();
                  reject(new Error('Falha ao comprimir imagem'));
                  return;
                }
                
                const blobSizeMB = blob.size / (1024 * 1024);
                console.log(`Tentativa com qualidade ${currentQuality}: ${blobSizeMB.toFixed(2)}MB`);
                
                // Se temos overrides, não tentamos ajustar automaticamente o tamanho
                if (overrideWidth && overrideHeight && overrideQuality) {
                   console.log(`✅ Tamanho final (override): ${blobSizeMB.toFixed(2)}MB`);
                   const file = new File([blob], fileName, { type: 'image/jpeg' });
                   cleanup();
                   resolve(file);
                   return;
                }

                // Algoritmo adaptativo para Ultra HD - ser mais conservador
                const minQuality = isUltraHD ? 0.7 : 0.3; // Mínimo 70% para Ultra HD
                const maxQuality = isUltraHD ? 0.95 : 0.9; // Máximo 95% para Ultra HD
                
                // Se ainda é muito grande e podemos reduzir mais
                if (blobSizeMB > 10 && currentQuality > minQuality) {
                  const newQuality = Math.max(minQuality, currentQuality - 0.05); // Redução menor para Ultra HD
                  console.log(`Arquivo grande (${blobSizeMB.toFixed(2)}MB), tentando com qualidade ${newQuality}`);
                  tryCompression(newQuality);
                  return;
                }
                
                // Se ficou muito pequeno e podemos melhorar a qualidade
                if (blobSizeMB < 1 && currentQuality < maxQuality) {
                  const newQuality = Math.min(maxQuality, currentQuality + 0.05); // Aumento menor para Ultra HD
                  console.log(`Arquivo pequeno (${blobSizeMB.toFixed(2)}MB), tentando com qualidade ${newQuality}`);
                  tryCompression(newQuality);
                  return;
                }
                
                // Tamanho ideal encontrado
                console.log(`✅ Tamanho final: ${blobSizeMB.toFixed(2)}MB (Ultra HD: ${isUltraHD ? 'Sim' : 'Não'})`);
                const file = new File([blob], fileName, { type: 'image/jpeg' });
                cleanup();
                resolve(file);
              },
              'image/jpeg',
              currentQuality
            );
          };
          
          // Iniciar compressão com qualidade inicial
          tryCompression(quality);
          
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      
      img.onerror = (error) => {
        cleanup();
        reject(new Error('Erro ao carregar imagem para redimensionamento'));
      };
      
      // Carregar imagem do base64
      try {
      const dataUrl = base64String.includes(',') ? base64String : `data:image/jpeg;base64,${base64String}`;
      img.src = dataUrl;
      } catch (error) {
        cleanup();
        reject(new Error('Erro ao processar dados da imagem'));
      }
    });
  };

  // FUNÇÃO OTIMIZADA: Processar imagem grande usando Web Worker (não trava UI)
  const processImageWithWorker = async (base64String, fileName, maxWidth = 2000, maxHeight = 1500, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      try {
        let worker;
        try {
          worker = new Worker(new URL('../workers/imageProcessor.worker.js', import.meta.url), { type: 'module' });
        } catch (workerError) {
          return processHighResolutionImage(base64String, fileName, maxWidth, maxHeight, quality)
            .then(resolve)
            .catch(reject);
        }
        const timeout = setTimeout(() => {
          if (worker) worker.terminate();
          reject(new Error('Timeout no processamento da imagem'));
        }, 60000);
        const dataUrl = base64String.includes(',') ? base64String : `data:image/jpeg;base64,${base64String}`;
        photoWorkerRef.current = worker;
        worker.postMessage({ imageData: dataUrl, maxWidth, maxHeight, quality, fileName });
        worker.onmessage = (e) => {
          clearTimeout(timeout);
          if (worker) worker.terminate();
          photoWorkerRef.current = null;
          if (e.data.success) {
            const blob = new Blob([e.data.buffer], { type: e.data.mime || 'image/webp' });
            const file = new File([blob], e.data.fileName, { type: e.data.mime || 'image/webp' });
            resolve(file);
          } else {
            reject(new Error(e.data.error || 'Erro no processamento'));
          }
        };
        worker.onerror = () => {
          clearTimeout(timeout);
          if (worker) worker.terminate();
          photoWorkerRef.current = null;
          processHighResolutionImage(base64String, fileName, maxWidth, maxHeight, quality)
            .then(resolve)
            .catch(reject);
        };
      } catch (error) {
        processHighResolutionImage(base64String, fileName, maxWidth, maxHeight, quality)
          .then(resolve)
          .catch(reject);
      }
    });
  };

  // FUNÇÃO MELHORADA: Processamento rápido de Base64 para alta resolução
  const processPhotoFromBase64Optimized = async (image) => {
    // Bloquear processamento paralelo
    if (isProcessingRef.current) {
      console.log('Processamento já em andamento, aguardando...');
      return;
    }
    
    // Verificar se componente está montado
    if (!isMountedRef.current) {
      console.log('Componente desmontado, cancelando processamento');
      return;
    }
    
    isProcessingRef.current = true;
    let previewUrl = null;
    
    // Timeout de segurança para evitar travamento
    const safetyTimeout = setTimeout(() => {
      if (isProcessingRef.current) {
        console.warn('Timeout no processamento de imagem, cancelando...');
        isProcessingRef.current = false;
        if (previewUrl) {
          try {
            URL.revokeObjectURL(previewUrl);
          } catch (e) {
            console.error('Erro ao limpar preview no timeout:', e);
          }
        }
      }
    }, 120000); // 2 minutos máximo
    
    try {
      const timestamp = Date.now();
      const fileName = `photo_${timestamp}.webp`;
      
      const base64String = image.base64String || (image.dataUrl?.includes(',') ? image.dataUrl.split(',')[1] : image.dataUrl);
      
      if (!base64String || base64String.length === 0) {
        throw new Error('Dados da imagem não disponíveis');
      }
      
      // Validar tamanho máximo (50MB em base64)
      if (base64String.length > 67 * 1024 * 1024) {
        throw new Error('Imagem muito grande para processar');
      }
      
      // Calcular tamanho aproximado em MB
      const sizeInBytes = (base64String.length * 3) / 4;
      const sizeInMB = sizeInBytes / (1024 * 1024);
      
      console.log(`📸 Processando imagem: ${sizeInMB.toFixed(2)}MB`);
      
      // ESTRATÉGIA PARA CÂMERAS DE ALTA RESOLUÇÃO
      // Desabilitar Web Worker temporariamente para evitar crashes
      // Usar sempre processamento normal otimizado
      if (sizeInMB > 3) {
        setIsPhotoProcessing(true);
        setPhotoProcessingProgress(5);
        setPhotoProcessingMessage('Processando imagem...');
        // // window.__BLOCK_NAVIGATION__ = true;
            // window.__BLOCK_MODAL_CLOSE__ = true;
        const optimizedFile = await processImageWithWorker(base64String, fileName, 2000, 1500, 0.85);
        previewUrl = URL.createObjectURL(optimizedFile);
        
        // Limpar timeout de segurança
        clearTimeout(safetyTimeout);
        
        // Verificar se componente ainda está montado antes de atualizar
        if (isMountedRef.current) {
        setFormData(prev => ({
          ...prev,
          photos: [...prev.photos, { 
            file: optimizedFile, 
            name: fileName, 
            preview: previewUrl 
          }]
        }));
        
        // feedback minimizado
        setPhotoProcessingProgress(100);
      } else {
          // Limpar preview se componente foi desmontado
          if (previewUrl) {
            try {
              URL.revokeObjectURL(previewUrl);
            } catch (e) {
              console.error('Erro ao limpar preview:', e);
            }
          }
        }
        
        isProcessingRef.current = false;
        
      } else {
        const optimizedFile = await processImageWithWorker(base64String, fileName, 2000, 1500, 0.9);
        previewUrl = URL.createObjectURL(optimizedFile);
        if (isMountedRef.current) {
          setFormData(prev => ({
            ...prev,
            photos: [...prev.photos, { 
              file: optimizedFile, 
              name: fileName, 
              preview: previewUrl 
            }]
          }));
        }
        clearTimeout(safetyTimeout);
        isProcessingRef.current = false;
      }
      
      if (errors.photos) {
        setErrors(prev => ({ ...prev, photos: undefined }));
      }
      
    } catch (error) {
      console.error('❌ Erro em processPhotoFromBase64Optimized:', error);
      
      // Limpar timeout
      clearTimeout(safetyTimeout);
      
      // Limpar preview se foi criado
      if (previewUrl) {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch (e) {
          console.error('Erro ao limpar preview:', e);
        }
      }
      
      isProcessingRef.current = false;
      
      // Não relançar erro para evitar crash, apenas logar
      if (isMountedRef.current) {
        toast({
          title: "⚠️ Erro ao processar foto",
          description: "Tente novamente ou use uma foto menor",
          variant: "destructive"
        });
      }
      setIsPhotoProcessing(false);
      setPhotoProcessingProgress(0);
      setPhotoProcessingMessage('');
      setTimeout(() => {
        window.__BLOCK_NAVIGATION__ = false;
        // window.__BLOCK_MODAL_CLOSE__ = false;
      }, 1500);
    }
  };

  // FUNÇÃO OTIMIZADA: Processar foto usando URI (mais eficiente que Base64)
  // Esta função usa Filesystem API para ler arquivo, evitando carregar tudo na memória
  const processPhotoFromUriOptimized = async (imagePath, fileName) => {
    try {
      // OTIMIZAÇÃO: Se tivermos o plugin VideoProcessor, usar caminho nativo direto
      // Isso evita ler o arquivo para memória (Base64/Blob) prevenindo OOM em fotos 50MP+
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('VideoProcessor')) {
        let finalPath = imagePath;
        // Normalizar caminho se necessário (embora VideoProcessor agora trate content://)
        if (finalPath.startsWith('file://')) {
          finalPath = finalPath.replace('file://', '');
        }

        // Tentar comprimir para garantir performance no upload
        try {
           // Só comprime se não for um arquivo já processado (evitar recompressão desnecessária)
           // Verifica tanto o nome lógico quanto o caminho físico
           if (!fileName.includes('compressed') && !finalPath.includes('compressed')) {
             const comp = await VideoProcessor.compressImage({ 
                 filePath: finalPath, 
                 maxWidth: 1280, // Aumentado levemente para 'medium'
                 maxHeight: 1280, 
                 maxSizeMB: 0.5, // Aumentado para 500KB para acomodar qualidade média
                 quality: 'medium', // Restaurado para medium
                 format: 'jpeg' 
             });
             if (comp && comp.outputPath) {
                 finalPath = comp.outputPath;
             }
           }
        } catch (e) {
           console.warn('Falha na compressão automática:', e);
           // Verificação de segurança - Apenas logar, não bloquear
           try {
              const meta = await VideoProcessor.getImageMetadata({ filePath: finalPath });
              if (meta.width > 4096 || meta.height > 4096) {
                 console.log("Imagem de alta resolução processada nativamente:", meta);
              }
           } catch (ignored) {
              console.warn("Falha ao verificar metadados da imagem, prosseguindo mesmo assim.");
           }
        }

        // GERAR THUMBNAIL LEVE (512px)
        let previewPath = finalPath;
        try {
           const thumb = await VideoProcessor.compressImage({
               filePath: finalPath,
               maxWidth: 512,
               maxHeight: 512,
               maxSizeMB: 0.5,
               quality: 'low',
               format: 'jpeg' // Thumbnail em JPEG para garantir orientação correta
           });
           if (thumb && thumb.outputPath) {
               previewPath = thumb.outputPath;
           }
        } catch (e) {
           console.warn('Falha ao gerar thumbnail fallback:', e);
        }

        setFormData(prev => ({
          ...prev,
          photos: [...prev.photos, { 
            file: null, // Importante: null para não ocupar memória JS
            name: fileName, 
            nativePath: finalPath,
            preview: Capacitor.convertFileSrc(previewPath)
          }]
        }));
        
        toast({ 
          title: "✅ Foto adicionada!", 
        });
        return;
      }

      // Converter caminho do Capacitor para caminho do Filesystem
      // O caminho pode ser absoluto (file://) ou relativo
      let filePath = imagePath;
      if (imagePath.startsWith('file://')) {
        filePath = imagePath.replace('file://', '');
      }
      if (imagePath.startsWith('capacitor://')) {
        filePath = imagePath.replace('capacitor://localhost/', '');
      }
      
      // FALLBACK SEGURO: Se não conseguimos usar o plugin nativo (VideoProcessor),
      // NÃO tentamos ler o arquivo via FileReader/Filesystem se for grande.
      // Apenas usamos a URL direta para preview se possível, mas evitamos carregar dados em memória.
      
      console.warn('VideoProcessor não disponível ou falha no processamento nativo. Usando fallback seguro.');
      
      // Tenta criar um preview direto sem ler o arquivo
      const previewUrl = Capacitor.convertFileSrc(filePath);
      
      setFormData(prev => ({
        ...prev,
        photos: [...prev.photos, { 
          file: null, // Não temos o objeto File seguro aqui
          name: fileName, 
          nativePath: filePath,
          preview: previewUrl 
        }]
      }));
      
      toast({ 
        title: "Foto adicionada", 
        description: "Foto adicionada (modo compatibilidade)" 
      });
      
    } catch (error) {
      console.error('Erro ao processar foto de URI:', error);
      // Não lançar erro para não quebrar a UI, apenas logar
      toast({ 
        title: "Erro na foto", 
        description: "Não foi possível processar a foto.", 
        variant: "destructive" 
      });
    }
  };

  // Handler para solicitação de gravação de vídeo (In-App)
  const handleRecordVideoRequest = () => {
    if (isTakingPhoto || isRecordingVideo || isProcessingRef.current) return;
    
    // Pequeno delay para evitar conflitos de UI
    setTimeout(() => {
        setCameraMode('video');
        setShowCamera(true);
        setIsRecordingVideo(true);
    }, 100);
  };

  // Handler unificado para captura da câmera In-App (Foto e Vídeo)
  // handleInAppCapture removido - processamento agora é feito diretamente nas funções de captura


  // Handler para captura interna da câmera
  const handleInAppCapture = async (capturedData) => {
    try {
      if (!capturedData) {
        throw new Error('Nenhum dado capturado');
      }

      setIsPhotoProcessing(true);
      setPhotoProcessingMessage('Processando imagem...');
      // setPhotoProcessingProgress(10);

      const timestamp = Date.now();
      
      // Se for vídeo (objeto com type='video')
      if (typeof capturedData === 'object' && capturedData.type === 'video') {
         return;
      }

      // Processamento de FOTO
      const fileName = `photo_${timestamp}.jpg`;
      
      let finalFile = null;
      let finalPath = null;
      let finalPreview = null;

      if (typeof capturedData === 'string') {
        // Veio como Base64 string (do CameraCapture)
        // Precisamos converter para File e criar URL de preview
        try {
            const base64Content = capturedData.includes(',') ? capturedData.split(',')[1] : capturedData;
            const byteCharacters = atob(base64Content);
            const arrayBuffer = new ArrayBuffer(byteCharacters.length);
            const uint8Array = new Uint8Array(arrayBuffer);
            
            for (let i = 0; i < byteCharacters.length; i++) {
                uint8Array[i] = byteCharacters.charCodeAt(i);
            }
            
            finalFile = new File([uint8Array], fileName, { type: 'image/jpeg' });
            finalPreview = URL.createObjectURL(finalFile);
            
            // Opcional: Salvar em cache nativo se necessário, mas para base64 direto, o File é suficiente para upload
        } catch (e) {
            console.error('Erro ao converter base64:', e);
            throw new Error('Falha ao processar imagem capturada');
        }
      } else if (capturedData.file) {
        // Veio como Blob/File (Web)
        finalFile = new File([capturedData.file], fileName, { type: 'image/jpeg' });
        finalPreview = URL.createObjectURL(finalFile);
      } else if (capturedData.path) {
        // Veio como path nativo
        finalPath = capturedData.path;
        finalPreview = Capacitor.convertFileSrc(finalPath);
      } else if (capturedData.webPath) {
        finalPath = capturedData.webPath;
        finalPreview = capturedData.webPath;
      }

      if (!finalPreview && !finalFile && !finalPath) {
          throw new Error('Formato de captura não reconhecido');
      }

      setFormData(prev => ({
        ...prev,
        photos: [...prev.photos, {
          file: finalFile,
          name: fileName,
          nativePath: finalPath,
          preview: finalPreview
        }]
      }));

      toast({
        title: "Foto capturada!",
        description: "Imagem adicionada com sucesso."
      });

    } catch (error) {
      console.error('Erro ao processar captura in-app:', error);
      toast({
        title: "Erro na captura",
        description: "Não foi possível processar a foto.",
        variant: "destructive"
      });
    } finally {
      setIsPhotoProcessing(false);
      setPhotoProcessingProgress(0);
      setShowCamera(false);
      setIsTakingPhoto(false);
    }
  };

  // FUNÇÃO PRINCIPAL MELHORADA: Fluxo unificado com a Galeria para máxima estabilidade
  const handleTakePhoto = async () => {
    if (isTakingPhoto || isRecordingVideo || isProcessingRef.current) {
      toast({
        title: "Aguarde...",
        description: "Já existe uma operação em andamento",
        variant: "destructive"
      });
      return;
    }

    // Se estiver em dispositivo móvel, usar câmera nativa para evitar OOM (Crash Kill)
     if (Capacitor.isNativePlatform()) {
       try {
         setIsTakingPhoto(true);
         // Usar VideoProcessor.capturePhoto que processa em background thread nativa
         // CONFIGURAÇÃO CONSERVADORA: Reduzimos resolução para evitar estouro de memória no retorno
         const result = await VideoProcessor.capturePhoto({
           quality: 'medium', // Qualidade média (aprox 80-85%)
           maxWidth: 1600,    // Reduzido de 2048 para 1600 (aprox 2MP) - suficiente e leve
           maxHeight: 1600,
           maxSizeMB: 3       // Limite de 3MB
         });

         if (result && result.filePath) {
          // Processar o resultado (que já vem comprimido do nativo)
          // Adicionamos um sufixo para indicar que não precisa reprocessar pesado
          const timestamp = Date.now();
          await processPhotoFromUriOptimized(result.filePath, `photo_native_${timestamp}.jpg`);
        }
      } catch (error) {
        console.error('Erro na câmera nativa:', error);
        if (error.message !== 'Captura cancelada ou arquivo indisponível') {
           toast({
             title: "Erro na câmera",
             description: "Não foi possível abrir a câmera nativa.",
             variant: "destructive"
           });
        }
      } finally {
        setIsTakingPhoto(false);
      }
      return;
    }
    
    // Fallback para Web: Ativar modo câmera in-app (JS)
    setCameraMode('photo');
    setShowCamera(true);
    setIsTakingPhoto(true);
  };

  // FUNÇÃO PARA PROCESSAMENTO EM BACKGROUND DE FOTOS PENDENTES
  const processPendingPhotoInBackground = async () => {
    if (!pendingPhotoRef.current || isProcessingRef.current) return;
    
    isProcessingRef.current = true;
    
    try {
      const image = pendingPhotoRef.current;
      pendingPhotoRef.current = null;
      
      // feedback minimizado
      
      if (image.base64String || image.dataUrl) {
        // Estratégia ULTRA conservadora para imagens muito grandes
        const base64String = image.base64String || (image.dataUrl?.includes(',') ? image.dataUrl.split(',')[1] : image.dataUrl);
        
        if (base64String) {
          const timestamp = Date.now();
          const fileName = `photo_${timestamp}.jpg`;
          
          // Processamento mínimo - apenas criar o arquivo
          const byteCharacters = atob(base64String);
          const arrayBuffer = new ArrayBuffer(byteCharacters.length);
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Copiar dados diretamente sem chunks
          for (let i = 0; i < byteCharacters.length; i++) {
            uint8Array[i] = byteCharacters.charCodeAt(i);
          }
          
          const photoFile = new File([uint8Array], fileName, { type: 'image/jpeg' });
          const previewUrl = URL.createObjectURL(photoFile);
          
          setFormData(prev => ({
            ...prev,
            photos: [...prev.photos, { 
              file: photoFile, 
              name: fileName, 
              preview: previewUrl,
              size: photoFile.size
            }]
          }));
          
          toast({
            title: "✅ Foto adicionada!",
            description: "Processamento em background concluído",
            variant: "default"
          });
        }
      }
    } catch (error) {
      console.error('❌ Erro no processamento em background:', error);
      toast({
        title: "❌ Falha no processamento",
        description: "Não foi possível processar a foto",
        variant: "destructive"
      });
    } finally {
      isProcessingRef.current = false;
    }
  };

  // FUNÇÃO ALTERNATIVA: Usar a câmera frontal (sempre funciona)
  const handleTakePhotoWithFrontCamera = async () => {
    if (isTakingPhoto || isRecordingVideo) return;
    
    setIsTakingPhoto(true);
    
    try {
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Camera')) {
        
        // Configurações para câmera frontal (seguro contra crash)
        const cameraOptions = {
          quality: 70,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
          direction: CameraDirection.Front,
          correctOrientation: true,
          saveToGallery: false,
          width: 1920, // Full HD é suficiente para selfie/rosto
          height: 1920
        };
        
        const image = await CapacitorCamera.getPhoto(cameraOptions);

        if (image && (image.path || image.webPath)) {
          const filePath = image.path || image.webPath;
          // USAR PLACEHOLDER para evitar crash de memória com imagens de 50MP na WebView
          const previewUrl = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E";

          const ts = Date.now();
          const fileName = `selfie_${ts}.jpg`;
          
          let fileSize = 0;
          try {
            if (Capacitor.isNativePlatform()) {
              const stat = await Filesystem.stat({ path: filePath });
              fileSize = stat.size;
            }
          } catch (e) {
            console.warn('Não foi possível obter tamanho do arquivo:', e);
          }

          setFormData(prev => ({
            ...prev,
            photos: [...prev.photos, {
              file: null,
              name: fileName,
              nativePath: filePath,
              preview: previewUrl,
              size: fileSize
            }]
          }));

          toast({ title: '✅ Foto adicionada!' });
        } else if (image && (image.base64String || image.dataUrl)) {
          await processPhotoFromBase64Optimized(image);
        }
        
      } else {
        photoCameraInputRef.current?.click();
      }
    } catch (error) {
      console.error('Erro com câmera frontal:', error);
    } finally {
      setIsTakingPhoto(false);
    }
  };

  // FUNÇÃO DE GALERIA OTIMIZADA: Prioriza fluxo nativo para evitar crash
  const handleOpenGallery = async () => {
    if (isTakingPhoto || isRecordingVideo || isProcessingRef.current) return;
    
    try {
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Camera')) {
        // Removido loading prévio "Abrindo galeria..." conforme solicitado
        // O loading será ativado apenas se uma imagem for realmente selecionada

        // Usar Camera plugin para selecionar da galeria com URI
        // Isso evita carregar o arquivo na memória do JS
        const image = await CapacitorCamera.getPhoto({
          source: CameraSource.Photos,
          resultType: CameraResultType.Uri,
          quality: 100, // Qualidade máxima
          width: 0, // 0 = Sem redimensionamento (Original)
          height: 0,
          correctOrientation: true,
          presentationStyle: 'fullscreen'
        });

        if (image && (image.path || image.webPath)) {
          setIsPhotoProcessing(true); // Ativa loading agora
          setPhotoProcessingMessage('Adicionando...');
          setPhotoProcessingProgress(30);
          
          const filePath = image.path || image.webPath;
          const ts = Date.now();
          const fileName = `photo_gallery_${ts}.jpg`;
          
          // MUDANÇA: Usar fluxo unificado de processamento e compressão
          // Isso garante que fotos da galeria sejam redimensionadas (1600x1600) igual à câmera
          await processPhotoFromUriOptimized(filePath, fileName);
          
        }
      } else {
        // Web fallback
        photoGalleryInputRef.current?.click();
      }
    } catch (e) {
      // Ignorar cancelamento
      if (!e.message?.includes('cancelled') && !e.message?.includes('cancelado')) {
         toast({ title: 'Erro ao selecionar foto', description: e.message || 'Tente novamente', variant: 'destructive' });
      }
    } finally {
      // Pequeno delay para garantir que a UI não trave na transição
      setTimeout(() => {
        setIsPhotoProcessing(false);
        // setPhotoProcessingProgress(0);
        setPhotoProcessingMessage('');
        // window.__BLOCK_NAVIGATION__ = false;
        // window.__BLOCK_MODAL_CLOSE__ = false;
      }, 800);
    }
  };

  const resizeAndCompressImage = (base64String, maxWidth = 1200, maxHeight = 1200, initialQuality = 0.7) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          
          // Função para tentar diferentes qualidades até atingir 10MB
          const tryCompression = (currentQuality) => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Falha ao comprimir imagem'));
                  return;
                }
                
                const blobSizeMB = blob.size / (1024 * 1024);
                console.log(`Compressão com qualidade ${currentQuality}: ${blobSizeMB.toFixed(2)}MB`);
                
                // Se ainda é muito grande, reduzir qualidade
                if (blobSizeMB > 10 && currentQuality > 0.3) {
                  const newQuality = Math.max(0.3, currentQuality - 0.1);
                  tryCompression(newQuality);
                  return;
                }
                
                // Se ficou muito pequeno, podemos melhorar a qualidade
                if (blobSizeMB < 1 && currentQuality < 0.9) {
                  const newQuality = Math.min(0.9, currentQuality + 0.1);
                  tryCompression(newQuality);
                  return;
                }
                
                // Tamanho ideal
                console.log(`✅ Imagem comprimida: ${blobSizeMB.toFixed(2)}MB`);
                resolve(blob);
              },
              'image/jpeg',
              currentQuality
            );
          };
          
          // Iniciar com qualidade inicial
          tryCompression(initialQuality);
          
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error('Erro ao carregar imagem'));
      
      const dataUrl = base64String.includes(',') ? base64String : `data:image/jpeg;base64,${base64String}`;
      img.src = dataUrl;
    });
  };

  const handleFileChange = async (e, fileType) => {
    const files = Array.from(e.target.files);
    
    if (!files || files.length === 0) {
      e.target.value = null;
      return;
    }
    
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    const validVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
    
    // Limite de tamanho para vídeos (50MB)
      const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
      // Limite de tamanho para imagens (100MB - permite 50MP+ RAW/PNG)
      const MAX_IMAGE_SIZE = 100 * 1024 * 1024; // 100MB
    
    for (const file of files) {
      // Validar tipo
      if (fileType === 'photos' && !validImageTypes.includes(file.type)) {
        toast({ 
          title: "Tipo de arquivo inválido!", 
          description: "Por favor, selecione apenas imagens (JPEG, PNG, WEBP ou GIF).", 
          variant: "destructive" 
        });
        continue;
      }
      if (fileType === 'videos' && !validVideoTypes.includes(file.type)) {
        toast({ 
          title: "Tipo de arquivo inválido!", 
          description: "Por favor, selecione apenas vídeos (MP4, MOV ou WEBM).", 
          variant: "destructive" 
        });
        continue;
      }
      
      // Validar tamanho
      const maxSize = fileType === 'videos' ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
      if (file.size > maxSize) {
        const sizeLimit = fileType === 'videos' ? '50MB' : '10MB';
        toast({ 
          title: "Arquivo muito grande!", 
          description: `O arquivo excede o limite de ${sizeLimit}. Por favor, use um arquivo menor ou aguarde a compressão automática.`, 
          variant: "destructive" 
        });
        continue;
      }

      try {
        // Para imagens da galeria, sempre otimizar para reduzir tamanho (limitando a 1MB e redimensionando)
        if (fileType === 'photos' && file.size > 200 * 1024) { // Processar imagens acima de 200KB
          if (Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
            const reader = new FileReader();
            setIsPhotoProcessing(true);
            setPhotoProcessingProgress(5);
            setPhotoProcessingMessage('Otimizando imagem...');
            // window.__BLOCK_NAVIGATION__ = true;
            // window.__BLOCK_MODAL_CLOSE__ = true;
            reader.onload = async (e) => {
              try {
                const base64String = e.target.result;
                const base64Data = typeof base64String === 'string' && base64String.includes(',') ? base64String.split(',')[1] : base64String;
                const ts = Date.now();
                const relPath = `temp/gallery_${ts}.webp`;
                await Filesystem.writeFile({ path: relPath, data: base64Data, directory: Directory.Cache });
                setPhotoProcessingProgress(30);
                const { uri } = await Filesystem.getUri({ path: relPath, directory: Directory.Cache });
                setPhotoProcessingProgress(45);
                let outPath = uri;
                try {
                  // Compressão balanceada (Max 500KB, 1280px, Medium Quality)
                  const comp = await VideoProcessor.compressImage({ 
                    filePath: uri, 
                    maxWidth: 1280, 
                    maxHeight: 1280, 
                    maxSizeMB: 0.5, 
                    quality: 'medium', 
                    format: 'jpeg' 
                  });
                  outPath = comp.outputPath || uri;
                } catch {}
                setPhotoProcessingProgress(85);
                setFormData(prev => ({
                  ...prev,
                  [fileType]: [...prev[fileType], { file: null, name: file.name, nativePath: outPath, preview: null, size: file.size }]
                }));
                setPhotoProcessingProgress(100);
              } catch (error) {
                const previewUrl = URL.createObjectURL(file);
                setFormData(prev => ({
                  ...prev,
                  [fileType]: [...prev[fileType], { file: file, name: file.name, preview: previewUrl, size: file.size }]
                }));
              } finally {
                setIsPhotoProcessing(false);
                setPhotoProcessingProgress(0);
                setPhotoProcessingMessage('');
                setTimeout(() => {
                  window.__BLOCK_NAVIGATION__ = false;
                  window.__BLOCK_MODAL_CLOSE__ = false;
                }, 1200);
              }
            };
            reader.readAsDataURL(file);
          } else {
            const reader = new FileReader();
            let previewUrl = null;
            setIsPhotoProcessing(true);
            setPhotoProcessingProgress(5);
            setPhotoProcessingMessage('Otimizando imagem...');
            // window.__BLOCK_NAVIGATION__ = true;
            // window.__BLOCK_MODAL_CLOSE__ = true;
            reader.onload = async (e) => {
              try {
                const base64String = e.target.result;
                // Web: 1280x1280 e qualidade 0.7 para bom balanço
                const optimizedFile = await processImageWithWorker(base64String, file.name, 1280, 1280, 0.7);
                previewUrl = URL.createObjectURL(optimizedFile);
                setFormData(prev => ({
                  ...prev,
                  [fileType]: [...prev[fileType], { file: optimizedFile, name: optimizedFile.name, preview: previewUrl, size: optimizedFile.size }]
                }));
                setPhotoProcessingProgress(100);
              } catch (error) {
                if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch {} }
                previewUrl = URL.createObjectURL(file);
                setFormData(prev => ({
                  ...prev,
                  [fileType]: [...prev[fileType], { file: file, name: file.name, preview: previewUrl, size: file.size }]
                }));
              } finally {
                setIsPhotoProcessing(false);
                setPhotoProcessingProgress(0);
                setPhotoProcessingMessage('');
                setTimeout(() => {
                  // window.__BLOCK_NAVIGATION__ = false;
                  // window.__BLOCK_MODAL_CLOSE__ = false;
                }, 1500);
              }
            };
            reader.onerror = () => {
              setIsPhotoProcessing(false);
              setPhotoProcessingProgress(0);
              setPhotoProcessingMessage('');
              setTimeout(() => {
                // window.__BLOCK_NAVIGATION__ = false;
                // window.__BLOCK_MODAL_CLOSE__ = false;
              }, 1500);
            };
            reader.readAsDataURL(file);
          }
        } else if (fileType === 'videos') {
          // Processamento de vídeos
          if (Capacitor.isNativePlatform()) {
            setIsPhotoProcessing(true);
            setPhotoProcessingMessage('Fazendo o upload de vídeo');
            // window.__BLOCK_NAVIGATION__ = true;
            // window.__BLOCK_MODAL_CLOSE__ = true;
            
            try {
              // 1. Salvar arquivo no cache para ter um path real
              const timestamp = Date.now();
              const fileName = `video_${timestamp}.mp4`;
              const reader = new FileReader();
              
              reader.onload = async (e) => {
                try {
                  const base64String = e.target.result;
                  const base64Data = base64String.split(',')[1];
                  
                  setPhotoProcessingProgress(20);
                  setPhotoProcessingMessage('Salvando temporário...');
                  
                  await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Cache
                  });
                  
                  const { uri } = await Filesystem.getUri({
                    path: fileName,
                    directory: Directory.Cache
                  });
                  
                  setPhotoProcessingProgress(40);
                  setPhotoProcessingMessage('Comprimindo vídeo...');
                  
                  // 2. Comprimir vídeo nativamente
                  const result = await VideoProcessor.compressVideo({
                    filePath: uri,
                    maxSizeMB: 5, // Limite agressivo (5MB) para garantir upload rápido
                    quality: 'medium',
                    maxWidth: 1280, // 720p é suficiente para relatórios
                    maxHeight: 1280
                  });
                  
                  // Gerar thumbnail
                  let preview = null;
                  try {
                    const { imagePath } = await VideoProcessor.getVideoThumbnail({ 
                      filePath: result.outputPath, 
                      maxWidth: 320, 
                      maxHeight: 240 
                    });
                    preview = Capacitor.convertFileSrc(imagePath);
                  } catch (thumbErr) {
                    console.warn('Falha ao gerar thumbnail nativo:', thumbErr);
                  }
                  
                  // setPhotoProcessingProgress(90);
                  
                  // 3. Atualizar estado
                  setFormData(prev => ({
                    ...prev,
                    videos: [...prev.videos, { 
                      file: null, // File original não é mais necessário se temos o path
                      name: file.name, 
                      nativePath: result.outputPath,
                      preview: preview,
                      size: result.compressedSize || 0
                    }]
                  }));
                  
                  toast({
                    title: "Vídeo processado!",
                    description: `Vídeo comprimido de ${(file.size / (1024*1024)).toFixed(1)}MB para ${(result.compressedSize / (1024*1024)).toFixed(1)}MB`
                  });
                  
                } catch (error) {
                  console.error('Erro no processamento do vídeo:', error);
                  toast({
                    title: "Erro ao processar vídeo",
                    description: error.message,
                    variant: "destructive"
                  });
                } finally {
                  setIsPhotoProcessing(false);
                  setPhotoProcessingProgress(0);
                  setPhotoProcessingMessage('');
                  // window.__BLOCK_NAVIGATION__ = false;
                  // window.__BLOCK_MODAL_CLOSE__ = false;
                }
              };
              
              reader.readAsDataURL(file);
              
            } catch (error) {
              console.error('Erro ao iniciar processamento:', error);
              setIsPhotoProcessing(false);
              window.__BLOCK_NAVIGATION__ = false;
              window.__BLOCK_MODAL_CLOSE__ = false;
            }
          } else {
            // Web fallback (sem compressão real por enquanto, apenas validação)
            console.log('Vídeo selecionado na web (sem compressão nativa)');
            setFormData(prev => ({
              ...prev,
              videos: [...prev.videos, { 
                file: file, 
                name: file.name, 
                preview: null,
                size: file.size
              }]
            }));
          }
        } else {
          // Processamento normal para imagens menores
          let previewUrl = null;
          try {
            previewUrl = URL.createObjectURL(file);
          setFormData(prev => ({
            ...prev,
            [fileType]: [...prev[fileType], { 
              file: file, 
              name: file.name, 
              preview: previewUrl 
            }]
          }));
          } catch (urlError) {
            console.error('Erro ao criar preview URL:', urlError);
            if (previewUrl) {
              try {
                URL.revokeObjectURL(previewUrl);
              } catch (e) {
                console.error('Erro ao limpar preview:', e);
              }
            }
            throw urlError;
          }
        }
        
        if (errors[fileType]) {
          setErrors(prev => ({ ...prev, [fileType]: undefined }));
        }
        
      } catch (error) {
        console.error("Error processing file:", error);
        toast({ 
          title: "Erro ao processar arquivo", 
          description: error.message || "Não foi possível carregar o arquivo selecionado.", 
          variant: "destructive" 
        });
      }
    }
    e.target.value = null;
  };

  const processPhotoFromPath = async (image) => {
    try {
      const timestamp = Date.now();
      const fileName = `photo_${timestamp}.webp`;
      
      // CRÍTICO: Não fazer fetch da imagem! 
      // Usar o caminho nativo diretamente para o upload e para o preview.
      // Carregar a imagem em memória (blob) via fetch causa crash com fotos de 50MP+.
      
      const nativePath = image.path || image.webPath;
      
      let fileSize = 0;
      try {
         if (Capacitor.isNativePlatform()) {
           const stat = await Filesystem.stat({ path: nativePath });
           fileSize = stat.size;
         }
      } catch (e) {
         console.warn('Não foi possível obter tamanho do arquivo (processPhotoFromPath):', e);
      }
      
      // Preview otimizado usando placeholder
      const previewUrl = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3C/svg%3E";
      
      setFormData(prev => ({
          ...prev,
          photos: [...prev.photos, { 
            file: null, // File é null para indicar uso de nativePath
            name: fileName, 
            nativePath: nativePath, 
            preview: previewUrl,
            size: fileSize
          }]
        }));
      
      toast({
        title: "✅ Foto adicionada!",
        description: "Foto processada com sucesso",
        variant: "default"
      });
      
    } catch (error) {
      console.error('❌ Erro no processamento de path:', error);
      toast({
        title: "❌ Erro ao processar foto",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsProcessingRef.current = false;
    }
  };

  // FUNÇÃO DE GRAVAÇÃO NATIVA (Solução para crash de memória e falha de compressão)
  const handleNativeVideoRecording = async () => {
    if (isTakingPhoto || isRecordingVideo || isProcessingRef.current) return;
    
    try {
      if (Capacitor.isNativePlatform()) {
        // Loading restaurado conforme solicitado
        setIsPhotoProcessing(true);
        setPhotoProcessingMessage('Fazendo upload de vídeo');
        
        // 1. Capturar vídeo usando Intent nativa (retorna path direto, sem Base64/Memória)
        // Isso resolve o problema crítico de falha na compressão pois não carregamos o vídeo no JS
        const { filePath, size } = await VideoProcessor.captureVideo({
                  maxDurationSec: 0, // Sem limite de tempo (0 = ilimitado)
                  lowQuality: false // Gravar com qualidade aceitável, o compressVideo cuidará do tamanho
              });
        
        if (!filePath) {
            // setIsPhotoProcessing(false);
            return;
        }

        // REMOVIDO: Toast de limite de tamanho e overlay de progresso
        
        // 2. Comprimir vídeo nativamente
        // Agora temos um path válido e acessível no sistema de arquivos
        const result = await VideoProcessor.compressVideo({
            filePath: filePath,
            maxSizeMB: 10, // Limite seguro
            quality: 'medium',
            maxWidth: 1280, // 720p
            maxHeight: 1280
        });
        
        // 3. Adicionar ao estado
        const timestamp = Date.now();
        const fileName = `video_${timestamp}.mp4`;
        
        setFormData(prev => ({
            ...prev,
            videos: [...prev.videos, { 
                file: null, 
                name: fileName, 
                nativePath: result.outputPath,
                preview: null 
            }]
        }));
        
        // REMOVIDO: Toast de tamanho final
        
      } else {
        // Web fallback
        videoCameraInputRef.current?.click();
      }
    } catch (error) {
      console.error('Erro na gravação nativa:', error);
      // Ignorar erro de cancelamento pelo usuário
      if (!error.message?.includes('cancelada') && !error.message?.includes('indisponível')) {
          toast({
            title: "Erro ao gravar",
            description: error.message || "Falha ao processar o vídeo. Tente novamente.",
            variant: "destructive"
          });
      }
    } finally {
      setIsPhotoProcessing(false);
      setPhotoProcessingProgress(0);
      setPhotoProcessingMessage('');
    }
  };

  const removeFile = (fileType, index) => {
    try {
    setFormData(prev => {
        // Proteção: garantir que o array existe
        if (!prev[fileType] || !Array.isArray(prev[fileType])) {
          return prev;
        }
        
      const fileToRemove = prev[fileType][index];
        
        
        
        // Limpar preview apenas se existir (para vídeos sempre será null)
      if (fileToRemove?.preview) {
          try {
        URL.revokeObjectURL(fileToRemove.preview);
          } catch (e) {
            console.error('Erro ao limpar preview:', e);
      }
        }
        
      const newFiles = [...prev[fileType]];
      newFiles.splice(index, 1);
        
      return {
        ...prev,
        [fileType]: newFiles
      };
    });
    } catch (error) {
      console.error('Erro ao remover arquivo:', error);
    }
  };

  // FUNÇÃO OTIMIZADA: Upload em streaming para arquivos grandes (>50MB)
  const uploadLargeFileInChunks = async (file, filePath, bucket = 'reports-media', onProgress) => {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB por chunk
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    // Para arquivos pequenos, usar upload normal
    if (file.size <= 50 * 1024 * 1024) {
      const { error } = await supabase.storage.from(bucket).upload(filePath, file);
      if (error) throw error;
      if (onProgress) onProgress(100);
      return;
    }
    
    // Para arquivos grandes, fazer upload direto com timeout maior
    // Nota: Supabase Storage não suporta multipart upload nativamente
    // Mas podemos fazer upload direto com melhor tratamento de erros
    toast({
      title: "📤 Upload em progresso...",
      description: `Enviando arquivo grande. Isso pode levar alguns minutos.`,
      duration: 10000
    });
    
    try {
      // Upload direto com timeout estendido
      const { error } = await supabase.storage.from(bucket).upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });
      
      if (error) {
        // Se erro de tamanho, tentar novamente com configurações diferentes
        if (error.message.includes('size') || error.message.includes('large')) {
          throw new Error('O servidor rejeitou o arquivo devido ao tamanho. Tente reduzir a qualidade ou duração.');
        }
        throw error;
      }
      
      if (onProgress) onProgress(100);
      
      toast({
        title: "✅ Upload concluído!",
        description: "Arquivo grande enviado com sucesso",
        duration: 2000
      });
    } catch (error) {
      console.error('Erro no upload de arquivo grande:', error);
      throw error;
    }
  };

  // FUNÇÃO OTIMIZADA: Processar vídeo grande em chunks (para validação)
  const processLargeVideoInChunks = async (file) => {
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks para validação
    
    // Validar vídeo lendo apenas primeiros bytes (verificar formato)
    const firstChunk = file.slice(0, Math.min(CHUNK_SIZE, file.size));
    const firstChunkArrayBuffer = await firstChunk.arrayBuffer();
    const firstBytes = new Uint8Array(firstChunkArrayBuffer);
    
    // Verificar assinatura MP4 (ftyp box) ou outros formatos
    const isValidMP4 = firstBytes.length >= 8 && 
      (firstBytes[4] === 0x66 && firstBytes[5] === 0x74 && firstBytes[6] === 0x79 && firstBytes[7] === 0x70);
    
    const isValidMOV = firstBytes.length >= 4 && 
      (firstBytes[0] === 0x00 && firstBytes[1] === 0x00 && firstBytes[2] === 0x00 && firstBytes[3] === 0x20);
    
    if (!isValidMP4 && !isValidMOV && !file.type.includes('video')) {
      throw new Error('Arquivo de vídeo inválido ou corrompido');
    }
    
    return {
      isValid: true,
      fileSize: file.size,
      format: isValidMP4 ? 'mp4' : isValidMOV ? 'mov' : 'unknown'
    };
  };

  // Função melhorada para upload de arquivos grandes com retry e progresso
  const uploadLargeFile = async (file, filePath, maxRetries = 3, onProgress, signal) => {
    const fileSizeMB = file.size / (1024 * 1024);
    
    // Para arquivos muito grandes, usar timeout maior
    const timeout = fileSizeMB > 200 ? 300000 : fileSizeMB > 100 ? 180000 : 120000; // 5min, 3min, 2min
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (signal?.aborted) throw new Error('Upload cancelado');

        const { data: signed, error: signedErr } = await supabase.storage
          .from('reports-media')
          .createSignedUploadUrl(filePath);
        if (signedErr) throw signedErr;
        const signedUrl = signed?.signedUrl || signed?.url;
        if (!signedUrl) throw new Error('Falha ao gerar URL assinada para upload');

        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', signedUrl);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          xhr.setRequestHeader('x-upsert', 'false');

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
              const percent = (e.loaded / e.total) * 100;
              onProgress(percent);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(true);
            } else {
              reject(new Error(`Erro no upload: ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error('Erro de rede no upload'));
          xhr.ontimeout = () => reject(new Error('Upload timeout'));

          if (signal) {
            signal.addEventListener('abort', () => {
              xhr.abort();
              reject(new Error('Upload cancelado'));
            });
          }

          xhr.timeout = timeout;
          xhr.send(file);
        });
        
        return { data: true };
      } catch (error) {
        if (error.message === 'Upload cancelado') throw error;
        console.warn(`Tentativa ${attempt}/${maxRetries} falhou:`, error.message);
        
        if (attempt === maxRetries) {
          throw new Error(`Upload falhou após ${maxRetries} tentativas: ${error.message}`);
        }
        
        // Esperar antes de tentar novamente (backoff exponencial)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  };

  const uploadMedia = async (reportId) => {
    // Proteção: criar array de forma segura sem spread que pode causar problemas
    const photosToUpload = formData.photos.map(p => {
      try {
        return { file: p.file, name: p.name, type: 'photo', nativePath: p.nativePath };
      } catch (e) {
        console.error('Erro ao processar foto para upload:', e);
        return null;
      }
    }).filter(p => p !== null);
    
    const videosToUpload = formData.videos.map(v => {
      try {
        return {
          file: v.file,
          name: v.name,
          type: 'video',
          id: v.id,
          nativePath: v.nativePath
        };
      } catch (e) {
        console.error('Erro ao processar vídeo para upload:', e);
        return null;
      }
    }).filter(v => v !== null);
    
    const mediaToUpload = [...photosToUpload, ...videosToUpload];
    
    if (mediaToUpload.length === 0) return { success: true };

    // Função auxiliar para processar cada item em paralelo
    const processMediaItem = async (media, onProgress, signal) => {
      try {
        // Checar cancelamento logo no início
        if (signal?.aborted) throw new Error('Upload cancelado');

        // Recuperar arquivo quando necessário e checar caminho nativo
        let mediaFile = media.file;
        const isNative = Capacitor.isNativePlatform?.() || false;
        const hasNativePath = isNative && media.nativePath;

        // Permitir upload via caminho nativo mesmo sem File/Blob
        if (!media || (!mediaFile && !hasNativePath)) {
          return { error: `Arquivo inválido: ${media?.name || 'desconhecido'}` };
        }
        
        if (!hasNativePath) {
          // Proteção adicional: verificar se file é um objeto File válido
          if (!(mediaFile instanceof File) && !(mediaFile instanceof Blob)) {
            return { error: `Arquivo inválido (não é File/Blob): ${media?.name || 'desconhecido'}` };
          }
        }
        
        // Proteção: não acessar propriedades do File que podem causar problemas
        // Sanitizar nome do arquivo para evitar erros de assinatura com caracteres especiais
        const rawFileName = media.name || `arquivo_${Date.now()}`;
        const safeFileName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${user.id}/${reportId}/${Date.now()}-${safeFileName}`;
        
        // Upload com suporte para arquivos grandes e plugin nativo
        let uploadResult;
        
        try {
          // Se temos caminho nativo no app, garantir compressão conservadora e usar URL assinada + plugin
          if (hasNativePath) {
            try {
              if (media.type === 'photo') {
                // Gerar URL assinada para upload direto (expira em 1 hora)
                const { data: signed, error: signedErr } = await supabase.storage
                  .from('reports-media')
                  .createSignedUploadUrl(filePath, 3600);
                
                if (signedErr) throw signedErr;
                const signedUrl = signed?.signedUrl || signed?.url;
                
                if (!signedUrl) throw new Error('Falha ao gerar URL assinada');

                // Upload bloqueante via plugin nativo
                await VideoProcessor.uploadFile({
                    filePath: media.nativePath,
                    uploadUrl: signedUrl,
                    headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }
                });
                
                uploadResult = { data: { path: filePath } };
              } else {
                try {
                  const meta = await VideoProcessor.getVideoMetadata({ filePath: media.nativePath });
                  if (!meta?.size || meta.size <= 0) {
                    throw new Error('Arquivo de vídeo vazio');
                  }
                } catch (metaErr) {
                  throw new Error(metaErr?.message || 'Falha ao validar vídeo');
                }

                const { data: signed, error: signedErr } = await supabase.storage
                  .from('reports-media')
                  .createSignedUploadUrl(filePath, 3600);
                if (signedErr) throw signedErr;
                const signedUrl = signed?.signedUrl || signed?.url;
                if (!signedUrl) throw new Error('Falha ao gerar URL assinada para upload');
    
                await VideoProcessor.uploadFile({
                  filePath: media.nativePath,
                  uploadUrl: signedUrl,
                  headers: { 'Content-Type': 'video/mp4', 'x-upsert': 'false' }
                });
                uploadResult = { data: { path: filePath } };
              }
              
              // Limpar temporários
              if (uploadResult) {
                try {
                   if (media.nativePath.includes('temp/')) {
                      // Tentar limpar apenas se for temp explícito, senão deixa o OS limpar cache
                   }
                } catch {}
              }
            } catch (err) {
               console.error('Erro no processamento nativo:', err);
               // Se não temos o arquivo em memória para fallback (comum em vídeos grandes nativos),
               // o erro é fatal pois não há como prosseguir.
               if (!mediaFile) {
                 throw new Error(`Falha no upload nativo: ${err.message || 'Erro desconhecido'}`);
               }
               // Caso contrário, deixa cair no fallback se tivermos o arquivo
            }
          }
          
          // Método fallback: upload normal via JS
          if (!uploadResult) {
            if (!mediaFile) throw new Error("Arquivo não disponível para fallback (sem File object)");

            // Usar uploadLargeFile sempre para garantir progresso e cancelamento
            uploadResult = await uploadLargeFile(mediaFile, filePath, 3, onProgress, signal);
            
            if (uploadResult.error) throw uploadResult.error;
          }
        } catch (uploadException) {
          return { error: `Erro ao fazer upload de ${media.name}: ${uploadException.message}` };
        }

        const { data: { publicUrl } } = supabase.storage.from('reports-media').getPublicUrl(filePath);
        
        return {
          success: true,
          data: {
            report_id: reportId,
            url: publicUrl,
            type: media.type,
            name: media.name,
          }
        };
      } catch (error) {
        return { error: `Erro ao processar ${media.name}: ${error.message}` };
      }
    };

    const results = [];
    const totalFiles = mediaToUpload.length;
    
    for (let i = 0; i < totalFiles; i++) {
        const media = mediaToUpload[i];
        
        // Check for cancellation
        if (uploadAbortControllerRef.current?.signal.aborted) {
             results.push({ success: false, error: 'Upload cancelado pelo usuário' });
             break;
        }

        const baseProgress = (i / totalFiles) * 100;
        const itemWeight = 100 / totalFiles;
        
        const onItemProgress = (percent) => {
            setUploadProgress(Math.min(99, Math.round(baseProgress + (percent * itemWeight / 100))));
        };
        
        // Initial progress for this item
        onItemProgress(0);

        const result = await processMediaItem(media, onItemProgress, uploadAbortControllerRef.current?.signal);
        results.push(result);
        
        // Final progress for this item
        onItemProgress(100);
    }
    setUploadProgress(100);

    const uploadResults = results.filter(r => r.success).map(r => r.data);
    const errors = results.filter(r => !r.success).map(r => r.error);

    if (uploadResults.length > 0) {
      const { error: insertError } = await supabase.from('report_media').insert(uploadResults);
      if (insertError) {
        errors.push(`Erro ao salvar mídia no banco: ${insertError.message}`);
      }
    }

    if (errors.length > 0) {
      toast({ 
        title: "Erro no Upload de Mídia", 
        description: errors.join('; '), 
        variant: "destructive" 
      });
      return { success: false, errors };
    }

    return { success: true };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const newErrors = {};
    let hasErrors = false;
    
    if (!formData.title || !formData.category) {
      if (!formData.title) newErrors.title = "Por favor, preencha o título da bronca.";
      if (!formData.category) newErrors.category = "Por favor, selecione uma categoria.";
      hasErrors = true;
    }
    if (!formData.location) {
      newErrors.location = "Por favor, marque o local da bronca no mapa.";
      hasErrors = true;
    }
    if (!formData.address || formData.address.trim() === '') {
      newErrors.address = "Por favor, preencha o endereço de referência.";
      hasErrors = true;
    }
    if ((formData.photos.length + formData.videos.length) === 0) {
      newErrors.photos = "Por favor, adicione pelo menos uma foto ou vídeo da bronca.";
      hasErrors = true;
    }
    if (formData.category === 'iluminacao' && (!formData.pole_number || formData.pole_number.trim() === '')) {
      newErrors.pole_number = "Por favor, informe o número do poste apagado.";
      hasErrors = true;
    }
    
    if (hasErrors) {
      setErrors(newErrors);
      const firstErrorField = Object.keys(newErrors)[0];
      const errorElement = document.querySelector(`[data-error-field="${firstErrorField}"]`);
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        errorElement.focus();
      }
      return;
    }
    
    setErrors({});
    setIsSubmitting(true);
    setUploadProgress(0);
    uploadAbortControllerRef.current = new AbortController();
    
    try {
      const uploadMediaWrapper = async (reportId) => {
        const result = await uploadMedia(reportId);
        if (!result.success && formData.photos.length + formData.videos.length > 0 && result.errors?.length === formData.photos.length + formData.videos.length) {
          throw new Error('Falha ao fazer upload de todos os arquivos. A criação da bronca foi cancelada.');
        }
        return result;
      };

      // Verificar se ainda está processando vídeo antes de submeter
      if (isAddingVideoRef.current || formData.videos.some(v => v.isProcessing)) {
        toast({
          title: "Aguarde...",
          description: "Ainda estamos processando seus vídeos. Por favor aguarde um momento.",
          variant: "default"
        });
        setIsSubmitting(false);
        return;
      }

      await onSubmit(formData, uploadMediaWrapper);
      
      // Limpar previews de forma segura
      try {
      formData.photos.forEach(photo => {
          if (photo?.preview) {
            try {
          URL.revokeObjectURL(photo.preview);
            } catch (e) {
              console.error('Erro ao limpar preview de foto:', e);
            }
        }
      });
      formData.videos.forEach(video => {
          if (video?.preview) {
            try {
          URL.revokeObjectURL(video.preview);
            } catch (e) {
              console.error('Erro ao limpar preview de vídeo:', e);
            }
        }
      });
      } catch (cleanupError) {
        console.error('Erro ao limpar previews:', cleanupError);
      }
      
      // Resetar estado de forma segura
      try {
      setFormData({ 
        title: '', 
        description: '', 
        category: '', 
        address: '', 
        location: null, 
        photos: [], 
        videos: [],
        pole_number: ''
      });
        
      } catch (resetError) {
        console.error('Erro ao resetar formData:', resetError);
      }
      
      // Fechar modal apenas após tudo estar limpo
      // Adicionar pequeno delay para garantir que tudo foi processado
      setTimeout(() => {
        try {
      onClose();
        } catch (closeError) {
          console.error('Erro ao fechar modal:', closeError);
        }
      }, 100);
    } catch (error) {
      console.error("Erro ao submeter formulário:", error);
      toast({ 
        title: "Erro ao criar bronca", 
        description: error.message || "Ocorreu um erro ao processar sua solicitação. Tente novamente.", 
        variant: "destructive" 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLocationChange = (newLocation) => {
    setFormData(prev => ({ ...prev, location: newLocation }));
  };

  const handleClose = () => {
    // REMOVIDO: Bloqueios de fechamento e delays (Solicitação do usuário)
    // Agora o modal fecha imediatamente e cancela processos em andamento via cleanup
    
    // Cancelar upload se estiver em andamento
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      uploadAbortControllerRef.current = null;
    }
    
    setIsSubmitting(false);
    setUploadProgress(0);
    
    formData.photos.forEach(photo => {
      if (photo?.preview) {
        URL.revokeObjectURL(photo.preview);
      }
    });
    formData.videos.forEach(video => {
      if (video?.preview) {
        URL.revokeObjectURL(video.preview);
      }
    });
    
    setFormData({ 
      title: '', 
      description: '', 
      category: '', 
      address: '', 
      location: null, 
      photos: [], 
      videos: [],
      pole_number: ''
    });
    
    setErrors({});
    
    onClose();
  };

  // Memoizar lista de vídeos para evitar re-renders problemáticos
  // Proteção EXTRA para evitar crash durante renderização
  // Removido: lista de vídeos é responsabilidade do VideoProcessorComponent

  // Wrapper seguro para handleClose que previne fechamento durante processamento
  const safeHandleClose = (e) => {
    // Verificar se é um clique no backdrop (não no conteúdo)
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[1200]" onClick={safeHandleClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold gradient-text">Nova Bronca</h2>
            <button 
              onClick={handleClose} 
              className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
              aria-label="Fechar modal"
              disabled={isSubmitting}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-muted-foreground mt-1">Cadastre um problema em Floresta-PE</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-foreground">Título da Bronca *</label>
              <span className="text-xs text-muted-foreground">{formData.title.length}/65</span>
            </div>
            <input 
              type="text" 
              value={formData.title} 
              onChange={(e) => {
                setFormData({ ...formData, title: e.target.value });
                if (errors.title) setErrors(prev => ({ ...prev, title: undefined }));
              }}
              data-error-field="title"
              maxLength="65" 
              className={`w-full bg-background px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent ${errors.title ? 'border-destructive' : 'border-input'}`}
              placeholder="Ex: Buraco na Rua Principal" 
              required 
            />
            {errors.title && (
              <p className="text-xs text-destructive mt-1">{errors.title}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Categoria *</label>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
              {categories.map((c) => (
                <button 
                  key={c.id} 
                  type="button" 
                  data-error-field="category"
                  onClick={() => {
                    setFormData({ ...formData, category: c.id, pole_number: c.id !== 'iluminacao' ? '' : formData.pole_number });
                    if (errors.category) setErrors(prev => ({ ...prev, category: undefined }));
                  }} 
                  className={`p-3 rounded-lg border-2 transition-all text-center ${formData.category === c.id ? 'border-primary bg-primary/10' : errors.category ? 'border-destructive' : 'border-border hover:border-accent'}`}
                >
                  <div className="text-2xl mb-1">{c.icon}</div>
                  <div className="text-xs font-medium">{c.name}</div>
                </button>
              ))}
            </div>
            {errors.category && (
              <p className="text-xs text-destructive mt-1">{errors.category}</p>
            )}
          </div>

          {formData.category === 'iluminacao' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Número do Poste <span className="text-destructive">*</span>
              </label>
              <input 
                type="text" 
                value={formData.pole_number} 
                onChange={(e) => {
                  setFormData({ ...formData, pole_number: e.target.value });
                  if (errors.pole_number) setErrors(prev => ({ ...prev, pole_number: undefined }));
                }}
                data-error-field="pole_number"
                className={`w-full bg-background px-4 py-3 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent ${errors.pole_number ? 'border-destructive' : 'border-input'}`}
                placeholder="Ex: 1234 ou P-5678" 
                required
              />
              {errors.pole_number ? (
                <p className="text-xs text-destructive mt-1">{errors.pole_number}</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Informe o número identificador do poste apagado. Este número é essencial para a resolução do problema.</p>
              )}
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-foreground">Descrição</label>
              <span className="text-xs text-muted-foreground">{formData.description.length}/2000</span>
            </div>
            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} maxLength="2000" rows={4} className="w-full bg-background px-4 py-3 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="Descreva detalhadamente o problema..." />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2"><MapPin className="w-4 h-4" /> Localização *</label>
            <p className="text-xs text-muted-foreground mb-2">Ajuste o marcador para o local exato da bronca.</p>
            <div id="location-picker-map" data-error-field="location" className={`h-64 w-full rounded-lg overflow-hidden border ${errors.location ? 'border-destructive' : 'border-input'}`}>
              {!isTakingPhoto ? (
                <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">Carregando mapa...</div>}>
                  <LocationPickerMap 
                    onLocationChange={(newLocation) => {
                      handleLocationChange(newLocation);
                      if (errors.location) setErrors(prev => ({ ...prev, location: undefined }));
                    }} 
                    initialPosition={formData.location} 
                  />
                </Suspense>
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center flex-col gap-2">
                  <Camera className="w-8 h-8 text-muted-foreground animate-pulse" />
                  <p className="text-sm text-muted-foreground">Câmera em uso...</p>
                </div>
              )}
            </div>
            {errors.location && (
              <p className="text-xs text-destructive mt-1">{errors.location}</p>
            )}
            <input 
              type="text" 
              value={formData.address} 
              onChange={(e) => {
                setFormData({ ...formData, address: e.target.value });
                if (errors.address) setErrors(prev => ({ ...prev, address: undefined }));
              }}
              data-error-field="address"
              className={`w-full bg-background px-4 py-3 border rounded-lg mt-3 focus:ring-2 focus:ring-primary focus:border-transparent ${errors.address ? 'border-destructive' : 'border-input'}`}
              placeholder="Endereço de referência (ex: Rua da Floresta, 123)" 
              required 
            />
            {errors.address && (
              <p className="text-xs text-destructive mt-1">{errors.address}</p>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-foreground">
                Mídia <span className="text-destructive">*</span>
              </label>
              {(formData.photos.length > 0 || formData.videos.length > 0) && (
                <span className="text-xs text-muted-foreground">
                  {formData.photos.length} foto{formData.photos.length !== 1 ? 's' : ''} • {formData.videos.length} vídeo{formData.videos.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {errors.photos && (
              <p className="text-xs text-destructive mb-2">{errors.photos}</p>
            )}
            {(formData.photos.length === 0 && formData.videos.length === 0 && !errors.photos) && (
              <p className="text-xs text-muted-foreground mb-2">Adicione pelo menos uma foto ou vídeo</p>
            )}
            <div className="space-y-3" data-error-field="photos">
              <input 
                type="file" 
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" 
                multiple 
                onChange={(e) => handleFileChange(e, 'photos')} 
                ref={photoGalleryInputRef} 
                className="hidden" 
                disabled={isSubmitting}
              />
              <input 
                type="file" 
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" 
                capture="environment" 
                onChange={(e) => handleFileChange(e, 'photos')} 
                ref={photoCameraInputRef} 
                className="hidden" 
                disabled={isSubmitting}
              />
              <input 
                type="file" 
                accept="video/mp4,video/quicktime,video/*" 
                capture="environment" 
                onChange={(e) => handleFileChange(e, 'videos')} 
                ref={videoCameraInputRef} 
                className="hidden" 
                disabled={isSubmitting}
              />

              {Capacitor.isNativePlatform() ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setCameraMode('photo');
                        handleTakePhoto();
                      }}
                      className="h-20 flex-col gap-1"
                      disabled={isSubmitting || isTakingPhoto}
                    >
                      <Camera className="w-6 h-6" />
                      <span className="text-xs">Tirar Foto</span>
                    </Button>
                
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={handleOpenGallery} 
                      className="h-20 flex-col gap-1"
                      disabled={isSubmitting}
                    >
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-xs">Galeria de Fotos</span>
                    </Button>
                  </div>
                  
                  <VideoProcessorComponent
                    maxVideos={5}
                    videos={formData.videos}
                    onVideosChange={(newVideosOrUpdater) => {
                      setFormData(prev => {
                        const currentVideos = prev.videos || [];
                        const newVideos = typeof newVideosOrUpdater === 'function' 
                          ? newVideosOrUpdater(currentVideos) 
                          : newVideosOrUpdater;
                        return { ...prev, videos: newVideos };
                      });
                    }}
                    disabled={isSubmitting}
                    showList={false}
                    onProcessingChange={(processing) => {
                      isAddingVideoRef.current = processing;
                      if (!processing) {
                        window.lastVideoAddedTime = Date.now();
                      }
                    }}
                  />
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleOpenGallery} 
                    className="h-20 flex-col gap-1"
                    disabled={isSubmitting}
                  >
                    <ImageIcon className="w-6 h-6" />
                    <span className="text-xs">Galeria de Fotos</span>
                  </Button>

                  <VideoProcessorComponent
                    maxVideos={5}
                    videos={formData.videos}
                    onVideosChange={(newVideosOrUpdater) => {
                      setFormData(prev => {
                        const currentVideos = prev.videos || [];
                        const newVideos = typeof newVideosOrUpdater === 'function' 
                          ? newVideosOrUpdater(currentVideos) 
                          : newVideosOrUpdater;
                        return { ...prev, videos: newVideos };
                      });
                    }}
                    disabled={isSubmitting}
                    showList={false}
                    onProcessingChange={(processing) => {
                      isAddingVideoRef.current = processing;
                      if (!processing) {
                        window.lastVideoAddedTime = Date.now();
                      }
                    }}
                  />
                </div>
              )}
            </div>
            
            {(formData.photos.length > 0 || formData.videos.length > 0) && (
              <div className="mt-4 space-y-3">
                <div className="flex justify-between items-center border-b pb-2 mb-2">
                  <h3 className="text-sm font-medium text-foreground">Arquivos Adicionados </h3>
                </div>

                {formData.photos.map((media, index) => (
                  <div 
                    key={`photo-${index}`} 
                    className="flex items-center justify-between bg-background p-2 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => setViewingPhotoIndex(index)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {media.preview && (
                   
                        <img 
                          src={media.preview} 
                          alt={media.name}
                          decoding="async"
                          loading="lazy"
                          className="w-12 h-12 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{media.name}</p>
                        
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile('photos', index);
                      }} 
                      className="text-muted-foreground hover:text-destructive p-1 ml-2"
                      aria-label="Remover foto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {formData.videos.map((video, index) => (
                  <div 
                    key={`video-${index}`} 
                    className={`flex items-center justify-between bg-background p-2 rounded-md border transition-colors ${video.isProcessing ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:bg-accent/50'}`}
                    onClick={() => !video.isProcessing && setViewingVideoIndex(index)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {video.preview ? (
                        <div className="relative w-12 h-12">
                          <img src={video.preview} alt="Thumb do vídeo" className="w-12 h-12 object-cover rounded" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded">
                            <Play className="w-3 h-3 text-white fill-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-muted flex items-center justify-center rounded relative border">
                          {video.isProcessing ? (
                            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                          ) : (
                            <Play className="w-5 h-5 text-muted-foreground fill-muted-foreground opacity-50" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{video.name}</p>
                        {video.isProcessing && (
                          <div className="w-full mt-1 space-y-1">
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>Otimizando...</span>
                              <span>{Math.round(video.progress || 0)}%</span>
                            </div>
                            <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary transition-all duration-300 ease-out"
                                style={{ width: `${video.progress || 0}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile('videos', index);
                      }} 
                      className="text-muted-foreground hover:text-destructive p-1 ml-2"
                      aria-label="Remover vídeo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Processamento de foto silencioso: sem modal/overlay */}
          </div>

          <div className="flex flex-col space-y-3 pt-4">
            {isSubmitting && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Enviando arquivos...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex space-x-3">
              <Button 
                type="button" 
                variant={isSubmitting ? "destructive" : "outline"}
                onClick={handleClose} 
                className="flex-1" 
                disabled={false}
              >
                {isSubmitting ? 'Cancelar Envio' : 'Cancelar'}
              </Button>
              {!isSubmitting && (
                <Button 
                  type="submit" 
                  className="flex-1 bg-primary hover:bg-primary/90" 
                  disabled={isSubmitting}
                >
                  Cadastrar Bronca
                </Button>
              )}
            </div>
          </div>
        </form>
      </motion.div>

      {/* Modal de Câmera (Restaurado) */}
      {showCamera && (
        <div className="fixed inset-0 z-[1300] bg-black">
          <CameraCapture
            initialMode={cameraMode}
            onCapture={handleInAppCapture}
            onClose={() => {
              setShowCamera(false);
              setIsTakingPhoto(false);
            }}
          />
        </div>
      )}

    

      {/* Media Viewer for Photos */}
      {viewingPhotoIndex !== null && createPortal(
        <MediaViewer
          media={formData.photos.map(p => ({
            type: 'photo',
            url: p.nativePath ? Capacitor.convertFileSrc(p.nativePath) : (p.preview || p.url),
            name: p.name
          }))}
          startIndex={viewingPhotoIndex}
          onClose={() => setViewingPhotoIndex(null)}
        />,
        document.body
      )}

      {/* Media Viewer for Videos */}
      {viewingVideoIndex !== null && createPortal(
        <MediaViewer
          media={formData.videos.map(v => ({
            type: 'video',
            url: v.nativePath ? Capacitor.convertFileSrc(v.nativePath) : (v.file ? URL.createObjectURL(v.file) : ''),
            name: v.name
          }))}
          startIndex={viewingVideoIndex}
          onClose={() => setViewingVideoIndex(null)}
        />,
        document.body
      )}
    </motion.div>
  );
};

export default ReportModal;

