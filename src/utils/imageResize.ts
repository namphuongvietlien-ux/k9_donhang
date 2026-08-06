/**
 * Resizes an image to a standard size while maintaining aspect ratio
 * Google recommends 600x600 or 1000x1000 for product images
 * @param file - The image file to resize
 * @param maxSize - Maximum width/height (default: 1000)
 * @param quality - JPEG quality 0-1 (default: 0.9)
 * @returns Promise<File> - Resized image file
 */
export const resizeImage = async (
  file: File,
  maxSize: number = 1000,
  quality: number = 0.9
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        
        // Only resize if image is larger than maxSize
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }
        
        // Create canvas and resize
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        
        // Use high-quality image rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        
        // Draw resized image
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to create blob"));
              return;
            }
            
            // Create new file with original name but updated extension if needed
            const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
            const fileName = file.name.replace(/\.[^/.]+$/, "");
            const mimeType = fileExt === "png" ? "image/png" : "image/jpeg";
            
            const resizedFile = new File(
              [blob],
              `${fileName}.${fileExt}`,
              {
                type: mimeType,
                lastModified: Date.now(),
              }
            );
            
            resolve(resizedFile);
          },
          file.type === "image/png" ? "image/png" : "image/jpeg",
          quality
        );
      };
      
      img.onerror = () => {
        reject(new Error("Failed to load image"));
      };
      
      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    
    reader.readAsDataURL(file);
  });
};

/**
 * Resizes an image to a square format (crops to center)
 * Useful for product images that need to be exactly square
 * @param file - The image file to resize
 * @param size - Size for both width and height (default: 1000)
 * @param quality - JPEG quality 0-1 (default: 0.9)
 * @returns Promise<File> - Resized square image file
 */
export const resizeImageToSquare = async (
  file: File,
  size: number = 1000,
  quality: number = 0.9
): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculate crop area (center crop)
        const minDimension = Math.min(img.width, img.height);
        const startX = (img.width - minDimension) / 2;
        const startY = (img.height - minDimension) / 2;
        
        // Create canvas
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        
        // Use high-quality image rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        
        // Draw cropped and resized image
        ctx.drawImage(
          img,
          startX,
          startY,
          minDimension,
          minDimension,
          0,
          0,
          size,
          size
        );
        
        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to create blob"));
              return;
            }
            
            // Create new file
            const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
            const fileName = file.name.replace(/\.[^/.]+$/, "");
            const mimeType = fileExt === "png" ? "image/png" : "image/jpeg";
            
            const resizedFile = new File(
              [blob],
              `${fileName}.${fileExt}`,
              {
                type: mimeType,
                lastModified: Date.now(),
              }
            );
            
            resolve(resizedFile);
          },
          file.type === "image/png" ? "image/png" : "image/jpeg",
          quality
        );
      };
      
      img.onerror = () => {
        reject(new Error("Failed to load image"));
      };
      
      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    
    reader.readAsDataURL(file);
  });
};

