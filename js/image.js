window.App = window.App || {};

App.Image = {
  MAX_WIDTH: 800,
  QUALITY: 0.7,

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > App.Image.MAX_WIDTH) {
          height = (height * App.Image.MAX_WIDTH) / width;
          width = App.Image.MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL('image/jpeg', App.Image.QUALITY);
        resolve(base64);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
};
