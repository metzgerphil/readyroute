#!/usr/bin/env swift

import AppKit
import AVFoundation
import Foundation
import Vision

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

guard CommandLine.arguments.count == 4 else {
    fail("usage: extract_video_visual_text.swift VIDEO OUTPUT_DIR STEP_SECONDS")
}

let videoPath = CommandLine.arguments[1]
let outputDirectory = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
guard let stepSeconds = Double(CommandLine.arguments[3]), stepSeconds > 0 else {
    fail("STEP_SECONDS must be positive")
}

let fileManager = FileManager.default
try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
let framesDirectory = outputDirectory.appendingPathComponent("frames", isDirectory: true)
try fileManager.createDirectory(at: framesDirectory, withIntermediateDirectories: true)

let asset = AVURLAsset(url: URL(fileURLWithPath: videoPath))
let duration = CMTimeGetSeconds(asset.duration)
guard duration.isFinite, duration > 0 else {
    fail("unable to determine video duration: \(videoPath)")
}

let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = CMTime(seconds: 0.05, preferredTimescale: 600)
generator.requestedTimeToleranceAfter = CMTime(seconds: 0.05, preferredTimescale: 600)

let outputPath = outputDirectory.appendingPathComponent("visual_text.jsonl")
fileManager.createFile(atPath: outputPath.path, contents: nil)
guard let outputHandle = try? FileHandle(forWritingTo: outputPath) else {
    fail("unable to open output: \(outputPath.path)")
}
defer { try? outputHandle.close() }

var index = 0
var timestamp = 0.0
while timestamp < duration {
    let requested = CMTime(seconds: timestamp, preferredTimescale: 600)
    var actual = CMTime.zero
    do {
        let image = try generator.copyCGImage(at: requested, actualTime: &actual)
        let actualSeconds = CMTimeGetSeconds(actual)
        let frameName = String(format: "frame-%04d-%09.3f.png", index, actualSeconds)
        let frameURL = framesDirectory.appendingPathComponent(frameName)
        let bitmap = NSBitmapImageRep(cgImage: image)
        guard let png = bitmap.representation(using: .png, properties: [:]) else {
            fail("unable to encode frame at \(actualSeconds)")
        }
        try png.write(to: frameURL)

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .fast
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["en-US"]
        request.usesCPUOnly = true
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        try handler.perform([request])
        let observations = (request.results ?? []).sorted { left, right in
            if abs(left.boundingBox.midY - right.boundingBox.midY) > 0.01 {
                return left.boundingBox.midY > right.boundingBox.midY
            }
            return left.boundingBox.minX < right.boundingBox.minX
        }
        let textLines = observations.compactMap { $0.topCandidates(1).first?.string }
        let row: [String: Any] = [
            "frame_index": index,
            "requested_seconds": timestamp,
            "actual_seconds": actualSeconds,
            "frame_path": "frames/\(frameName)",
            "text_lines": textLines,
        ]
        let data = try JSONSerialization.data(withJSONObject: row, options: [.sortedKeys])
        outputHandle.write(data)
        outputHandle.write(Data("\n".utf8))
    } catch {
        FileHandle.standardError.write(
            Data("frame \(index) at \(timestamp): \(error)\n".utf8)
        )
    }
    index += 1
    timestamp = min(duration - 0.001, Double(index) * stepSeconds)
    if timestamp <= 0 || index > Int(ceil(duration / stepSeconds)) + 1 {
        break
    }
}

print("extracted \(index) frames from \(videoPath) to \(outputDirectory.path)")
