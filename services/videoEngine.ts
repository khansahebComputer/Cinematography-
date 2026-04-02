export class VideoEngine {
  static async generateSceneVideo(
    imageUrl: string,
    audioUrl: string,
    duration: number,
    aspectRatio: '16:9' | '9:16' | '1:1' = '16:9'
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('Canvas context failed');

      // Set dimensions based on aspect ratio
      if (aspectRatio === '16:9') {
        canvas.width = 1280;
        canvas.height = 720;
      } else if (aspectRatio === '9:16') {
        canvas.width = 720;
        canvas.height = 1280;
      } else {
        canvas.width = 1080;
        canvas.height = 1080;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageUrl;

      img.onload = () => {
        const stream = canvas.captureStream(30); // 30 FPS
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 5000000
        });

        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          resolve(URL.createObjectURL(blob));
        };

        mediaRecorder.start();

        // Animation loop
        let start: number | null = null;
        const animate = (timestamp: number) => {
          if (!start) start = timestamp;
          const progress = (timestamp - start) / 1000;

          // Draw image with slight zoom effect
          const scale = 1 + progress * 0.05;
          const w = canvas.width * scale;
          const h = canvas.height * scale;
          const x = (canvas.width - w) / 2;
          const y = (canvas.height - h) / 2;

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, x, y, w, h);

          if (progress < duration) {
            requestAnimationFrame(animate);
          } else {
            mediaRecorder.stop();
          }
        };

        requestAnimationFrame(animate);
      };

      img.onerror = () => reject('Image load failed');
    });
  }

  static async speak(text: string): Promise<string> {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Try to find a good voice
      const voices = synth.getVoices();
      utterance.voice = voices.find(v => v.name.includes('Google') || v.name.includes('Natural')) || voices[0];
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Since Web Speech API doesn't directly give a blob, we'd normally use a library or backend.
      // For this "Local" demo, we'll return a placeholder or use a trick if possible.
      // Realistically, we'd use a TTS API. Let's simulate for now.
      resolve("https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"); 
    });
  }

  static async mergeVideos(videoUrls: string[], aspectRatio: '16:9' | '9:16' | '1:1' = '16:9'): Promise<string> {
    if (videoUrls.length === 0) throw new Error('No videos to merge');
    if (videoUrls.length === 1) return videoUrls[0];

    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('Canvas context failed');

      if (aspectRatio === '16:9') {
        canvas.width = 1280;
        canvas.height = 720;
      } else if (aspectRatio === '9:16') {
        canvas.width = 720;
        canvas.height = 1280;
      } else {
        canvas.width = 1080;
        canvas.height = 1080;
      }

      const stream = canvas.captureStream(30);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 5000000
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(URL.createObjectURL(blob));
      };

      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;

      let currentVideoIndex = 0;

      const playNextVideo = () => {
        if (currentVideoIndex >= videoUrls.length) {
          mediaRecorder.stop();
          return;
        }

        video.src = videoUrls[currentVideoIndex];
        video.load();
        video.onloadeddata = () => {
          video.play();
          requestAnimationFrame(drawFrame);
        };
        video.onended = () => {
          currentVideoIndex++;
          playNextVideo();
        };
      };

      const drawFrame = () => {
        if (video.paused || video.ended) return;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        requestAnimationFrame(drawFrame);
      };

      mediaRecorder.start();
      playNextVideo();
    });
  }
}
