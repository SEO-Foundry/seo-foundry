# Implementation Plan

- [x] 1. Set up Picture Press session management utilities
  - Extend existing Pixel Forge session utilities to support multiple file uploads
  - Create `saveMultipleUploads` function in session management
  - Add `ConversionSessionMeta` type extending `GenerationSessionMeta`
  - Write unit tests for multi-file session handling
  - _Requirements: 1.1, 1.2, 1.3, 6.1_

- [x] 2. Create image conversion engine with ImageMagick integration
  - Implement `src/server/lib/picture-press/converter.ts` with conversion utilities
  - Create `convertImages` function supporting multiple output formats (JPEG, PNG, WebP, GIF, TIFF, BMP)
  - Implement naming convention logic (keep original, custom patterns, prefix/suffix)
  - Add progress callback support for real-time updates
  - Write unit tests for conversion logic and naming patterns
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.4_

- [x] 3. Implement Picture Press tRPC router
  - Create `src/server/api/routers/picture-press.ts` with core procedures
  - Implement `newSession` procedure (reuse from Pixel Forge)
  - Implement `uploadImages` procedure for multi-file batch uploads
  - Add file validation and security checks using existing patterns
  - Write integration tests for upload procedures
  - _Requirements: 1.1, 1.2, 1.4, 5.1, 6.3_

- [x] 4. Implement image conversion procedure in tRPC router
  - Add `convertImages` procedure with format and naming options
  - Integrate ImageMagick conversion engine with progress tracking
  - Implement real-time progress updates using existing progress utilities
  - Add error handling for conversion failures with graceful degradation
  - Write integration tests for conversion workflow
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.5_

- [ ] 5. Add progress tracking and ZIP download procedures
  - Implement `getConversionProgress` procedure (adapt from Pixel Forge)
  - Create `zipConvertedImages` procedure for bulk downloads
  - Add session cleanup procedure (reuse existing implementation)
  - Implement secure file URL generation for converted images
  - Write tests for progress tracking and ZIP creation
  - Fix all eslinter errors as the last task
  - _Requirements: 2.4, 4.4, 4.5, 5.2, 6.4_

- [ ] 6. Create Picture Press options sidebar component
  - Implement `src/app/_components/PicturePressOptions.tsx` based on SidebarOptions
  - Add format selection UI with support for JPEG, PNG, WebP, GIF, TIFF, BMP
  - Implement quality slider for lossy formats
  - Create naming convention selection (keep original vs custom pattern)
  - Add custom pattern input with preview functionality
  - Write component tests for option selection and validation
  - Fix all eslinter errors as the last task
  - _Requirements: 2.1, 3.1, 3.2, 3.3, 6.2_

- [ ] 7. Adapt upload area component for multi-file support
  - Modify existing UploadArea component to handle multiple file selection
  - Add batch upload progress display
  - Implement individual file validation feedback
  - Add file preview grid for uploaded images
  - Create file removal functionality for individual uploads
  - Write component tests for multi-file upload behavior
  - Fix all eslinter errors as the last task
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 6.2_

- [ ] 8. Adapt result grid component for conversion results
  - Create `ConvertedImageItem` type for conversion results
  - Modify ResultGrid to show before/after comparison
  - Display conversion statistics (original size, converted size, savings)
  - Implement individual and bulk download functionality
  - Add format and quality information display
  - Write component tests for conversion result display
  - Fix all eslinter errors as the last task
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.2_

- [ ] 9. Create Picture Press main page component
  - Implement `src/app/picture-press/page.tsx` with complete workflow
  - Integrate upload area, options sidebar, and result grid components
  - Add tRPC hooks for session management and conversion operations
  - Implement progress polling during conversion
  - Add error handling and user feedback for all operations
  - Write integration tests for complete user workflow
  - Fix all eslinter errors as the last task
  - _Requirements: 1.1, 2.1, 4.1, 4.2, 6.2_

- [ ] 10. Add Picture Press router to main tRPC router
  - Import and integrate `picturePressRouter` in `src/server/api/root.ts`
  - Ensure proper type exports for client-side usage
  - Add Picture Press to navigation or main page links
  - Write integration tests for router registration
  - Fix all eslinter errors as the last task
  - _Requirements: 6.1, 6.4_

- [ ] 11. Implement comprehensive error handling and validation
  - Add client-side file validation before upload
  - Implement server-side security validation using existing patterns
  - Add graceful error handling for conversion failures
  - Create user-friendly error messages and recovery suggestions
  - Write tests for error scenarios and edge cases
  - Fix all eslinter errors as the last task
  - _Requirements: 1.5, 5.1, 5.2, 5.3, 5.4_

- [ ] 12. Add security and rate limiting integration
  - Apply existing rate limiting patterns to all Picture Press procedures
  - Implement per-session concurrency locks for conversion operations
  - Add file serving security using existing secure route patterns
  - Ensure session cleanup and TTL management
  - Write security tests covering rate limits and access controls. re-use any similar tests from pixel-forge
  - Fix all eslinter errors as the last task
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.3, 6.4_

- [ ] 13. Create comprehensive test suite
  - Write unit tests for conversion utilities and naming logic
  - Add integration tests for complete conversion workflow
  - Create component tests for all UI components
  - Add end-to-end tests for user scenarios
  - Implement test data fixtures with various image formats
  - Fix all eslinter errors as the last task
  - _Requirements: 6.5_

- [ ] 14. Add Picture Press page routing and navigation
  - Create route at `/picture-press` following Next.js App Router patterns
  - Add navigation links from main page or header component
  - Ensure proper page metadata and SEO optimization
  - Add loading states and error boundaries
  - Write tests for routing and navigation
  - Fix all eslinter errors as the last task
  - _Requirements: 4.1, 6.2_

- [ ] 15. Optimize performance and add monitoring
  - Implement batch processing optimization for large file sets
  - Add memory usage monitoring during conversion
  - Optimize progress reporting granularity
  - Add conversion performance metrics
  - Write performance tests and benchmarks
  - Fix all eslinter errors as the last task
  - _Requirements: 2.4, 5.5_
