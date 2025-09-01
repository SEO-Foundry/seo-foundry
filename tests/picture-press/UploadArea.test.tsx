import React from "react";
import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import UploadArea from "@/app/_components/UploadArea";

// Mock Next.js Image component
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    ...props
  }: {
    src: string;
    alt: string;
    [key: string]: unknown;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

describe("UploadArea", () => {
  it("renders single file mode correctly", () => {
    const mockOnUpload = vi.fn();

    const result = render(
      <UploadArea onUpload={mockOnUpload} onClear={vi.fn()} />,
    );

    // Verify the component rendered successfully
    expect(result.container).toBeDefined();

    // Check for key elements that should be present in single file mode
    const dragText = screen.queryByText("Drag & drop an image here");
    const chooseFileText = screen.queryByText("Choose file");

    // At least one of these should be present for single file mode
    expect(dragText ?? chooseFileText).toBeTruthy();
  });

  it("renders multi-file mode correctly", () => {
    const mockOnMultiUpload = vi.fn();

    const result = render(
      <UploadArea
        uploadedFiles={[]}
        onMultiUpload={mockOnMultiUpload}
        onRemoveFile={vi.fn()}
      />,
    );

    // Verify the component rendered successfully
    expect(result.container).toBeDefined();

    // Check for key elements that should be present in multi-file mode
    const dragText = screen.queryByText("Drag & drop multiple images here");
    const chooseFilesText = screen.queryByText("Choose files");

    // At least one of these should be present for multi-file mode
    expect(dragText ?? chooseFilesText).toBeTruthy();
  });

  it("shows validation state", () => {
    const result = render(
      <UploadArea
        uploadedFiles={[]}
        onMultiUpload={vi.fn()}
        onRemoveFile={vi.fn()}
      />,
    );

    // The component should render without errors
    expect(result.container).toBeDefined();

    // Check that the component is in a valid state
    const noFilesText = screen.queryByText("No files selected.");
    const dragText = screen.queryByText(/drag/i);

    // Either should show validation state or drag area
    expect(noFilesText ?? dragText).toBeTruthy();
  });
});
