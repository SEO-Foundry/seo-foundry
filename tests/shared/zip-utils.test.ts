import { describe, it, expect, vi } from "vitest";
import { createDirectoryZip } from "@/server/lib/shared/zip-utils";

// Mock archiver
vi.mock("archiver", () => {
  const mockArchive = {
    on: vi.fn(),
    pipe: vi.fn(),
    directory: vi.fn(),
    finalize: vi.fn(),
  };
  return {
    default: vi.fn(() => mockArchive),
    __esModule: true,
  };
});

// Mock fs
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    createWriteStream: vi.fn(),
  };
});

import archiver from "archiver";
import { createWriteStream } from "fs";

const mockArchiver = vi.mocked(archiver);
const mockCreateWriteStream = vi.mocked(createWriteStream);

describe("zip-utils", () => {
  it("creates a ZIP archive successfully", async () => {
    const mockOutput = {
      on: vi.fn((event: string, callback: Function) => {
        if (event === "close") {
          setTimeout(callback, 10);
        }
        return mockOutput;
      }),
    };
    const mockArchive = {
      on: vi.fn(),
      pipe: vi.fn(),
      directory: vi.fn(),
      finalize: vi.fn(),
    };

    mockCreateWriteStream.mockReturnValue(mockOutput as any);
    mockArchiver.mockReturnValue(mockArchive as unknown);

    await expect(createDirectoryZip("/source", "/output.zip")).resolves.toBeUndefined();

    expect(mockCreateWriteStream).toHaveBeenCalledWith("/output.zip");
    expect(mockArchiver).toHaveBeenCalledWith("zip", { zlib: { level: 9 } });
    expect(mockArchive.directory).toHaveBeenCalledWith("/source", false);
    expect(mockArchive.finalize).toHaveBeenCalled();
  });
});