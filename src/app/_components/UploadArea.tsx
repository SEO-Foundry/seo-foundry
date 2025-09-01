"use client";

import React, { useCallback, useRef, useState } from "react";
import Image from "next/image";

export type UploadedFile = {
  id: string;
  file: File;
  dataUrl: string;
  name: string;
  size: number;
  type: string;
  error?: string;
};

type Props = {
  // Legacy single file props (for Pixel Forge compatibility)
  previewUrl?: string | null;
  onUpload?: (file: File, dataUrl: string) => void;
  onClear?: () => void;
  
  // Multi-file props (for Picture Press)
  uploadedFiles?: UploadedFile[];
  onMultiUpload?: (files: UploadedFile[]) => void;
  onRemoveFile?: (fileId: string) => void;
  maxFiles?: number;
  showProgress?: boolean;
  uploadProgress?: Record<string, number>;
};

export default function UploadArea({ 
  previewUrl, 
  onUpload, 
  onClear,
  uploadedFiles = [],
  onMultiUpload,
  onRemoveFile,
  maxFiles = 10,
  showProgress = false,
  uploadProgress = {}
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Determine if we're in multi-file mode
  const isMultiFileMode = !!onMultiUpload;

  const validateFile = (file: File): string | null => {
    // Check if file exists and has content
    if (!file || file.size === 0) {
      return `${file?.name ?? 'Unknown file'}: File is empty or corrupted.`;
    }

    // Check file name for security issues
    const fileName = file.name;
    if (!fileName || fileName.trim() === '') {
      return 'File must have a valid name.';
    }

    // Check for potentially dangerous file names
    const dangerousPatterns = [
      /\.\./,  // Path traversal
      /[<>:"|?*\x00-\x1f]/,  // Invalid filename characters
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i,  // Windows reserved names
    ];
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(fileName)) {
        return `${fileName}: Invalid file name. Please rename the file and try again.`;
      }
    }

    // Check file name length
    if (fileName.length > 255) {
      return `${fileName}: File name too long. Please use a shorter name (max 255 characters).`;
    }

    // Check file type by MIME type and extension
    const supportedMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'image/tiff',
      'image/bmp'
    ];
    
    const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif', '.bmp'];
    const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    
    // Validate MIME type
    if (!supportedMimeTypes.includes(file.type.toLowerCase())) {
      return `${fileName}: Unsupported file type "${file.type}". Please use JPEG, PNG, GIF, WebP, TIFF, or BMP images.`;
    }

    // Validate file extension matches MIME type
    if (!supportedExtensions.includes(fileExtension)) {
      return `${fileName}: Unsupported file extension "${fileExtension}". Please use .jpg, .png, .gif, .webp, .tiff, or .bmp files.`;
    }

    // Cross-validate MIME type and extension for security
    const mimeExtensionMap: Record<string, string[]> = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/jpg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'image/tiff': ['.tiff', '.tif'],
      'image/bmp': ['.bmp']
    };

    const expectedExtensions = mimeExtensionMap[file.type.toLowerCase()];
    if (expectedExtensions && !expectedExtensions.includes(fileExtension)) {
      return `${fileName}: File extension "${fileExtension}" doesn't match the file type "${file.type}". This may indicate a corrupted or mislabeled file.`;
    }

    // Check file size (10MB limit, same as Pixel Forge)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return `${fileName}: File too large (${sizeMB}MB). Maximum size is 10MB. Try compressing the image or use a smaller version.`;
    }

    // Check minimum file size (avoid empty or corrupted files)
    const minSize = 100; // 100 bytes minimum
    if (file.size < minSize) {
      return `${fileName}: File too small (${file.size} bytes). This may indicate a corrupted file. Minimum size is ${minSize} bytes.`;
    }

    // Additional validation for suspicious files
    if (file.type === '' || file.type === 'application/octet-stream') {
      return `${fileName}: Unable to determine file type. Please ensure this is a valid image file.`;
    }

    return null;
  };

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      
      setValidationErrors([]);

      if (!isMultiFileMode) {
        // Legacy single file mode
        const file = files[0];
        if (!file) return;
        
        const error = validateFile(file);
        if (error) {
          setValidationErrors([error]);
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          onUpload?.(file, result);
        };
        reader.readAsDataURL(file);
        return;
      }

      // Multi-file mode
      const fileArray = Array.from(files);
      const errors: string[] = [];
      const validFiles: File[] = [];

      // Check if adding these files would exceed the limit
      if (uploadedFiles.length + fileArray.length > maxFiles) {
        errors.push(`Cannot upload ${fileArray.length} files. Maximum ${maxFiles} files allowed (${uploadedFiles.length} already uploaded).`);
        setValidationErrors(errors);
        return;
      }

      // Validate each file
      fileArray.forEach(file => {
        const error = validateFile(file);
        if (error) {
          errors.push(error);
        } else {
          validFiles.push(file);
        }
      });

      if (errors.length > 0) {
        setValidationErrors(errors);
        
        // If no valid files, return early
        if (validFiles.length === 0) {
          return;
        }
      }

      // Process valid files
      if (validFiles.length > 0) {
        const newUploadedFiles: UploadedFile[] = [];
        let processedCount = 0;
        const processingErrors: string[] = [];

        validFiles.forEach(file => {
          const reader = new FileReader();
          
          reader.onload = () => {
            try {
              const result = reader.result;
              
              // Validate the result
              if (!result || typeof result !== 'string') {
                processingErrors.push(`${file.name}: Failed to read file content.`);
                processedCount++;
                
                if (processedCount === validFiles.length) {
                  handleProcessingComplete();
                }
                return;
              }

              // Validate base64 data
              const base64Data = result.split(',')[1];
              if (!base64Data || base64Data.length === 0) {
                processingErrors.push(`${file.name}: Invalid file format or corrupted data.`);
                processedCount++;
                
                if (processedCount === validFiles.length) {
                  handleProcessingComplete();
                }
                return;
              }

              const uploadedFile: UploadedFile = {
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                file,
                dataUrl: result,
                name: file.name,
                size: file.size,
                type: file.type
              };
              
              newUploadedFiles.push(uploadedFile);
              processedCount++;

              if (processedCount === validFiles.length) {
                handleProcessingComplete();
              }
            } catch (error) {
              processingErrors.push(`${file.name}: Error processing file - ${error instanceof Error ? error.message : 'Unknown error'}`);
              processedCount++;
              
              if (processedCount === validFiles.length) {
                handleProcessingComplete();
              }
            }
          };

          reader.onerror = () => {
            processingErrors.push(`${file.name}: Failed to read file. The file may be corrupted or inaccessible.`);
            processedCount++;
            
            if (processedCount === validFiles.length) {
              handleProcessingComplete();
            }
          };

          reader.onabort = () => {
            processingErrors.push(`${file.name}: File reading was cancelled.`);
            processedCount++;
            
            if (processedCount === validFiles.length) {
              handleProcessingComplete();
            }
          };

          // Start reading the file
          try {
            reader.readAsDataURL(file);
          } catch (error) {
            processingErrors.push(`${file.name}: Cannot read file - ${error instanceof Error ? error.message : 'Unknown error'}`);
            processedCount++;
            
            if (processedCount === validFiles.length) {
              handleProcessingComplete();
            }
          }
        });

        function handleProcessingComplete() {
          // Combine all errors
          const allErrors = [...errors, ...processingErrors];
          if (allErrors.length > 0) {
            setValidationErrors(allErrors);
          }

          // Call callback with successfully processed files
          if (newUploadedFiles.length > 0) {
            onMultiUpload?.(newUploadedFiles);
          }
        }
      }
    },
    [onUpload, onMultiUpload, isMultiFileMode, uploadedFiles.length, maxFiles],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      void handleFiles(e.dataTransfer?.files ?? null);
    },
    [handleFiles],
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) setDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isMultiFileMode) {
    return (
      <div className="relative w-full rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur">
        {/* Upload Drop Zone */}
        <div
          className={[
            "group relative flex w-full flex-col items-center justify-center rounded-xl border border-dashed p-6 transition",
            uploadedFiles.length > 0 ? "min-h-[120px]" : "aspect-video",
            dragOver
              ? "border-emerald-300/50 bg-emerald-400/5"
              : "border-white/15 bg-gradient-to-br from-white/5 to-white/[0.02] hover:from-white/10",
          ].join(" ")}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <div className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-[radial-gradient(800px_circle_at_0%_0%,rgba(99,102,241,0.12),transparent_55%),radial-gradient(800px_circle_at_100%_100%,rgba(16,185,129,0.12),transparent_55%)]" />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mb-3 h-10 w-10 text-white/70"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.25"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5V8.25A2.25 2.25 0 0 1 5.25 6h6.879a2.25 2.25 0 0 1 1.59.659l3.621 3.621a2.25 2.25 0 0 1 .66 1.591V16.5A2.25 2.25 0 0 1 15.75 18.75H5.25A2.25 2.25 0 0 1 3 16.5z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5l5.25-5.25L15 18"
            />
          </svg>
          <p className="mb-2 text-sm text-white/80">
            {uploadedFiles.length > 0 
              ? `Drag & drop more images here (${uploadedFiles.length}/${maxFiles})`
              : "Drag & drop multiple images here"
            }
          </p>
          <p className="mb-4 text-xs text-white/60">JPEG, PNG, GIF, WebP, TIFF, BMP</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-md border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/20"
              onClick={() => inputRef.current?.click()}
              disabled={uploadedFiles.length >= maxFiles}
            >
              {uploadedFiles.length > 0 ? "Add more files" : "Choose files"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
            <div className="flex items-start gap-2">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-red-300">Upload Errors</h4>
                <ul className="mt-1 text-xs text-red-200">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* File Preview Grid */}
        {uploadedFiles.length > 0 && (
          <div className="mt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-white/80">
                Uploaded Files ({uploadedFiles.length})
              </h3>
              {uploadedFiles.length > 1 && (
                <button
                  type="button"
                  className="text-xs text-white/60 hover:text-white/80"
                  onClick={() => {
                    uploadedFiles.forEach(file => onRemoveFile?.(file.id));
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {uploadedFiles.map((uploadedFile) => (
                <div
                  key={uploadedFile.id}
                  className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/5"
                >
                  {/* Image Preview */}
                  <div className="aspect-square relative">
                    <Image
                      src={uploadedFile.dataUrl}
                      alt={uploadedFile.name}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover"
                      unoptimized
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  </div>

                  {/* File Info Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <p className="truncate text-xs font-medium text-white" title={uploadedFile.name}>
                      {uploadedFile.name}
                    </p>
                    <p className="text-xs text-white/70">
                      {formatFileSize(uploadedFile.size)}
                    </p>
                  </div>

                  {/* Progress Bar */}
                  {showProgress && uploadProgress[uploadedFile.id] !== undefined && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                      <div 
                        className="h-full bg-emerald-400 transition-all duration-300"
                        style={{ width: `${uploadProgress[uploadedFile.id]}%` }}
                      />
                    </div>
                  )}

                  {/* Remove Button */}
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white/80 opacity-0 transition-opacity hover:bg-black/70 hover:text-white group-hover:opacity-100"
                    onClick={() => onRemoveFile?.(uploadedFile.id)}
                    title="Remove file"
                  >
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status Footer */}
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-white/60">
            {uploadedFiles.length === 0
              ? "No files selected."
              : `${uploadedFiles.length} file${uploadedFiles.length === 1 ? '' : 's'} ready for conversion.`
            }
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-white/10 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white/90 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => inputRef.current?.click()}
              disabled={uploadedFiles.length >= maxFiles}
            >
              {uploadedFiles.length > 0 ? "Add more" : "Upload files"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Legacy single file mode (for Pixel Forge compatibility)
  return (
    <div className="relative w-full rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.05)] backdrop-blur">
      <div
        className={[
          "group relative flex aspect-video w-full flex-col items-center justify-center rounded-xl border border-dashed p-6 transition",
          dragOver
            ? "border-emerald-300/50 bg-emerald-400/5"
            : "border-white/15 bg-gradient-to-br from-white/5 to-white/[0.02] hover:from-white/10",
        ].join(" ")}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {!previewUrl ? (
          <>
            <div className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-[radial-gradient(800px_circle_at_0%_0%,rgba(99,102,241,0.12),transparent_55%),radial-gradient(800px_circle_at_100%_100%,rgba(16,185,129,0.12),transparent_55%)]" />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mb-3 h-10 w-10 text-white/70"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.25"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5V8.25A2.25 2.25 0 0 1 5.25 6h6.879a2.25 2.25 0 0 1 1.59.659l3.621 3.621a2.25 2.25 0 0 1 .66 1.591V16.5A2.25 2.25 0 0 1 15.75 18.75H5.25A2.25 2.25 0 0 1 3 16.5z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5l5.25-5.25L15 18"
              />
            </svg>
            <p className="mb-2 text-sm text-white/80">
              Drag & drop an image here
            </p>
            <p className="mb-4 text-xs text-white/60">PNG, JPG, or WebP</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-md border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/20"
                onClick={() => inputRef.current?.click()}
              >
                Choose file
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          </>
        ) : (
          <div className="relative h-full w-full">
            <div className="relative h-full w-full overflow-hidden rounded-lg">
              <Image
                src={previewUrl}
                alt="Preview"
                fill
                sizes="(max-width: 768px) 100vw, 75vw"
                className="object-contain"
                unoptimized
                priority={false}
              />
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-white/10 ring-inset" />
          </div>
        )}
      </div>

      {/* Validation Errors for single file mode */}
      {validationErrors.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
          <div className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-red-300">{validationErrors[0]}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-white/60">
          {previewUrl
            ? "Image ready. Configure options and generate variants."
            : "No file selected."}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-white/10 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white/90 hover:bg-white/20"
            onClick={() => inputRef.current?.click()}
          >
            {previewUrl ? "Replace image" : "Upload image"}
          </button>
          {previewUrl && onClear ? (
            <button
              type="button"
              className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/75 hover:bg-white/10"
              onClick={onClear}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
