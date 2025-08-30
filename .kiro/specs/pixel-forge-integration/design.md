# Design Document

## Overview

The Pixel Forge Integration replaces the existing mock image generation system in SEO Foundry's `/pixel-forge` page with real pixel-forge package integration. This design leverages the existing UI components (UploadArea, SidebarOptions, ResultGrid) and connects them to pixel-forge's programmatic API through tRPC procedures, enabling users to generate actual SEO-optimized web assets.

The integration maintains the existing user experience while providing real functionality through server-side processing, file management, and progress tracking.

## Architecture

### High-Level Flow
1. **Client Upload**: User uploads image via existing UploadArea component
2. **Server Storage**: tRPC procedure stores image temporarily on server
3. **Option Selection**: User selects generation options via updated SidebarOptions
4. **Server Processing**: tRPC procedure calls pixel-forge API with selected options
5. **Progress Tracking**: Real-time progress updates via tRPC subscriptions or polling
6. **Result Display**: Generated assets displayed in existing ResultGrid
7. **File Serving**: Static file serving for downloads and previews

### Technology Stack
- **Frontend**: Existing React components with minimal modifications
- **Backend**: tRPC procedures for file handling and pixel-forge integration
- **File Storage**: Temporary server-side storage for uploads and generated assets
- **Processing**: pixel-forge programmatic API (`generateAssets` function)
- **Progress**: tRPC subscriptions or polling for real-time updates

## Components and Interfaces

### 1. Updated SidebarOptions Component

**Current State**: Handles sizes, styles, formats, padding, border options
**New State**: Handle pixel-forge generation types and metadata

```typescript
export type PixelForgeSelections = {
  // Generation types (replaces sizes/styles/formats)
  generationTypes: ('favicon' | 'pwa' | 'social' | 'seo' | 'web' | 'all')[];
  
  // Modifier flags
  transparent?: boolean; // Supplementary flag that can be combined with other generation types
  
  // Advanced options
  appName?: string;
  description?: string;
  themeColor?: string;
  backgroundColor?: string;
  
  // Output options
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
  urlPrefix?: string;
};
```

**Changes Required**:
- Replace existing option types with pixel-forge generation types
- Add transparent checkbox as supplementary modifier flag
- Add optional metadata fields for app customization
- Update UI to show expected file counts per generation type
- Add "Generate All" shortcut option

### 2. tRPC Router (`src/server/api/routers/pixel-forge.ts`)

**File Upload Procedure**:
```typescript
uploadImage: publicProcedure
  .input(z.object({
    fileName: z.string(),
    fileData: z.string(), // base64 encoded
    mimeType: z.string()
  }))
  .mutation(async ({ input }) => {
    // Store file temporarily, return file path and preview URL
  })
```

**Generation Procedure**:
```typescript
generateAssets: publicProcedure
  .input(z.object({
    imagePath: z.string(),
    options: z.object({
      generationTypes: z.array(z.enum(['favicon', 'pwa', 'social', 'seo', 'web', 'all'])),
      transparent: z.boolean().optional(),
      appName: z.string().optional(),
      description: z.string().optional(),
      themeColor: z.string().optional(),
      backgroundColor: z.string().optional(),
      format: z.enum(['png', 'jpeg', 'webp']).optional(),
      quality: z.number().min(1).max(100).optional(),
      urlPrefix: z.string().optional()
    })
  }))
  .mutation(async ({ input }) => {
    // Call pixel-forge API, return generated assets metadata
  })
```

**Progress Tracking Procedure**:
```typescript
getGenerationProgress: publicProcedure
  .input(z.object({ sessionId: z.string() }))
  .query(async ({ input }) => {
    // Return current progress for active generation
  })
```

**File Cleanup Procedure**:
```typescript
cleanupSession: publicProcedure
  .input(z.object({ sessionId: z.string() }))
  .mutation(async ({ input }) => {
    // Clean up temporary files
  })
```

### 3. Updated ResultGrid Component

**Current State**: Displays mock variants with download functionality
**New State**: Display real pixel-forge assets with proper categorization

```typescript
export type PixelForgeAsset = {
  id: string;
  fileName: string;
  filePath: string;
  downloadUrl: string;
  previewUrl?: string;
  category: 'favicon' | 'pwa' | 'social' | 'seo' | 'transparent' | 'meta';
  dimensions?: string;
  fileSize?: string;
  purpose: string; // Human-readable description
};

export type PixelForgeResult = {
  assets: PixelForgeAsset[];
  metaTagsHtml: string;
  summary: {
    totalFiles: number;
    categories: Record<string, number>;
  };
};
```

**Changes Required**:
- Update asset display to show real file information
- Add category grouping/filtering
- Display meta-tags.html in dedicated section with copy functionality
- Update download functionality for real files

### 4. File Management System

**Temporary Storage Structure**:
```
/tmp/pixel-forge-sessions/
  ├── [sessionId]/
  │   ├── uploads/
  │   │   └── original.[ext]
  │   ├── generated/
  │   │   ├── favicon-16x16.png
  │   │   ├── pwa-192x192.png
  │   │   ├── social-media-general.png
  │   │   ├── meta-tags.html
  │   │   └── manifest.json
  │   └── progress.json
```

**Session Management**:
- Generate unique session IDs for each user interaction
- Store session metadata (upload time, generation status, file paths)
- Implement cleanup for expired sessions (24-hour TTL)
- Handle concurrent generations per session

## Data Models

### 1. Generation Session
```typescript
interface GenerationSession {
  id: string;
  uploadedFile: {
    originalName: string;
    tempPath: string;
    mimeType: string;
    size: number;
  };
  options: PixelForgeSelections;
  status: 'idle' | 'processing' | 'completed' | 'error';
  progress: {
    current: number;
    total: number;
    currentOperation: string;
  };
  results?: PixelForgeResult;
  error?: string;
  createdAt: Date;
  expiresAt: Date;
}
```

### 2. Asset Metadata
```typescript
interface AssetMetadata {
  fileName: string;
  category: 'favicon' | 'pwa' | 'social' | 'seo' | 'transparent' | 'meta';
  purpose: string;
  dimensions?: { width: number; height: number };
  fileSize: number;
  mimeType: string;
  downloadUrl: string;
  previewUrl?: string;
}
```

## Error Handling

### 1. Upload Errors
- **Invalid file type**: Clear error message with supported formats
- **File too large**: Display size limits and compression suggestions
- **Upload failure**: Retry mechanism with exponential backoff

### 2. Processing Errors
- **pixel-forge API errors**: Parse and display specific error messages
- **ImageMagick missing**: Server configuration error with admin guidance
- **Disk space issues**: Graceful degradation with cleanup

### 3. Network Errors
- **tRPC connection issues**: Retry with user feedback
- **Timeout handling**: Long-running generations with progress updates
- **Session expiry**: Clear messaging and restart option

### 4. Error Recovery
- **Partial generation failures**: Display successful assets, report failures
- **Cleanup on error**: Ensure temporary files are removed
- **User guidance**: Specific suggestions for common issues

## Testing Strategy

### 1. Unit Tests
- **tRPC procedures**: Mock pixel-forge API, test input validation
- **File management**: Test upload, storage, cleanup operations
- **Progress tracking**: Test progress calculation and updates
- **Error handling**: Test all error scenarios and recovery

### 2. Integration Tests
- **End-to-end flow**: Upload → Generate → Download
- **pixel-forge integration**: Test with real pixel-forge API
- **File system operations**: Test temporary storage and cleanup
- **Session management**: Test concurrent sessions and expiry

### 3. UI Tests
- **Component updates**: Test SidebarOptions and ResultGrid changes
- **User interactions**: Test upload, generation, download flows
- **Error states**: Test error display and recovery
- **Progress feedback**: Test progress indicators and messaging

### 4. Performance Tests
- **Large file handling**: Test with various image sizes
- **Concurrent generations**: Test multiple simultaneous users
- **Memory usage**: Monitor server memory during processing
- **Cleanup efficiency**: Test session cleanup and file removal

## Implementation Phases

### Phase 1: Core Integration (MVP)
1. **tRPC Router Setup**: Create basic pixel-forge router with upload and generation procedures
2. **File Management**: Implement temporary file storage and session management
3. **SidebarOptions Update**: Replace mock options with pixel-forge generation types
4. **Basic Generation**: Implement "Generate All" functionality
5. **ResultGrid Update**: Display real generated assets with download links

### Phase 2: Enhanced Features
1. **Progress Tracking**: Implement real-time progress updates
2. **Granular Options**: Add individual generation type selection (favicon, pwa, social, etc.)
3. **Metadata Customization**: Add app name, theme color, description fields
4. **Error Handling**: Comprehensive error handling and user feedback
5. **Meta Tags Display**: Dedicated section for meta-tags.html with copy functionality

### Phase 3: Polish and Optimization
1. **Performance Optimization**: Optimize file handling and generation speed
2. **Advanced Options**: Add format selection, quality settings, URL prefix
3. **Batch Operations**: Support multiple image processing
4. **Analytics**: Track usage patterns and performance metrics
5. **Documentation**: User guides and troubleshooting

## Security Considerations

### 1. File Upload Security
- **File type validation**: Strict MIME type checking
- **File size limits**: Prevent DoS through large uploads
- **Content scanning**: Basic malware detection for uploaded files
- **Path traversal prevention**: Secure file path handling

### 2. Session Security
- **Session isolation**: Prevent cross-session file access
- **Temporary file cleanup**: Automatic cleanup to prevent data leakage
- **Rate limiting**: Prevent abuse through excessive generations
- **Input sanitization**: Validate all user inputs

### 3. Server Security
- **Process isolation**: Sandbox pixel-forge execution
- **Resource limits**: CPU and memory limits for generation processes
- **Error information**: Avoid exposing sensitive server information
- **Access controls**: Proper file permissions and access restrictions

## Performance Considerations

### 1. File Processing
- **Streaming uploads**: Handle large files efficiently
- **Parallel processing**: Utilize multiple CPU cores for generation
- **Caching**: Cache common generation results
- **Compression**: Optimize generated file sizes

### 2. Memory Management
- **Buffer management**: Efficient image buffer handling
- **Garbage collection**: Proper cleanup of temporary objects
- **Memory limits**: Prevent memory exhaustion
- **Resource monitoring**: Track memory usage patterns

### 3. Scalability
- **Horizontal scaling**: Design for multiple server instances
- **Load balancing**: Distribute generation load
- **Queue management**: Handle high-volume generation requests
- **Database optimization**: Efficient session and metadata storage