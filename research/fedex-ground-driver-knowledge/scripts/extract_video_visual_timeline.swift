#!/usr/bin/env swift

import AppKit
import AVFoundation
import Foundation
import Vision

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

func timestamp(_ seconds: Double) -> String {
    let total = max(0, Int(seconds.rounded()))
    return String(format: "%02d:%02d", total / 60, total % 60)
}

func escapeTSV(_ value: String) -> String {
    value
        .replacingOccurrences(of: "\t", with: " ")
        .replacingOccurrences(of: "\r", with: " ")
        .replacingOccurrences(of: "\n", with: " | ")
}

func recognizeText(_ image: CGImage) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .fast
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-US"]
    request.usesCPUOnly = true
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try handler.perform([request])
    return (request.results ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: " | ")
}

let arguments = CommandLine.arguments
guard arguments.count == 3 || arguments.count == 4 else {
    fail("usage: extract_video_visual_timeline.swift VIDEO_PATH OUTPUT_DIR [INTERVAL_SECONDS]")
}

let videoURL = URL(fileURLWithPath: arguments[1]).standardizedFileURL
let outputURL = URL(fileURLWithPath: arguments[2]).standardizedFileURL
let interval = arguments.count == 4 ? Double(arguments[3]) ?? 5.0 : 5.0
guard interval > 0 else { fail("interval must be greater than zero") }
guard FileManager.default.fileExists(atPath: videoURL.path) else {
    fail("video does not exist: \(videoURL.path)")
}

try FileManager.default.createDirectory(
    at: outputURL,
    withIntermediateDirectories: true,
    attributes: nil
)

let asset = AVURLAsset(url: videoURL)
let duration = CMTimeGetSeconds(asset.duration)
guard duration.isFinite && duration > 0 else { fail("invalid video duration") }

var sampleTimes: [Double] = []
var cursor = 0.0
while cursor < duration {
    sampleTimes.append(cursor)
    cursor += interval
}
let finalSample = max(0, duration - 0.05)
if let last = sampleTimes.last, finalSample - last > 0.5 {
    sampleTimes.append(finalSample)
}

let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

var frameURLs: [URL] = []
var timeline = "frame_index\ttime_seconds\ttimestamp\tfile\tocr_text\n"
for (index, seconds) in sampleTimes.enumerated() {
    let requested = CMTime(seconds: seconds, preferredTimescale: 600)
    var actual = CMTime.zero
    let cgImage: CGImage
    do {
        cgImage = try generator.copyCGImage(at: requested, actualTime: &actual)
    } catch {
        // Some MP4s cannot decode a requested sample within the final few
        // hundredths of a second even though the preceding interval frame is
        // valid. Preserve the completed timeline in that narrow case.
        if index == sampleTimes.count - 1 && duration - seconds <= 0.1 && !frameURLs.isEmpty {
            FileHandle.standardError.write(
                Data(("warning: skipped undecodable final sample at \(seconds): \(error)\n").utf8)
            )
            continue
        }
        fail("frame extraction failed at \(seconds): \(error)")
    }
    let actualSeconds = CMTimeGetSeconds(actual)
    let filename = String(
        format: "frame-%04d-%07.2fs.jpg",
        index,
        actualSeconds
    )
    let frameURL = outputURL.appendingPathComponent(filename)
    let representation = NSBitmapImageRep(cgImage: cgImage)
    guard let jpeg = representation.representation(
        using: .jpeg,
        properties: [.compressionFactor: 0.88]
    ) else { fail("could not encode frame \(index)") }
    try jpeg.write(to: frameURL, options: .atomic)
    frameURLs.append(frameURL)
    let recognizedText: String
    do {
        recognizedText = try recognizeText(cgImage)
    } catch {
        recognizedText = "[OCR_ERROR: \(error)]"
    }
    timeline += "\(index)\t\(String(format: "%.3f", actualSeconds))\t\(timestamp(actualSeconds))\t\(filename)\t\(escapeTSV(recognizedText))\n"
}
try timeline.write(
    to: outputURL.appendingPathComponent("visual_timeline.tsv"),
    atomically: true,
    encoding: .utf8
)

let columns = 4
let cellWidth = 320
let imageHeight = 180
let labelHeight = 24
let rowsPerSheet = 4
let framesPerSheet = columns * rowsPerSheet
let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
let labelAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.monospacedSystemFont(ofSize: 13, weight: .medium),
    .foregroundColor: NSColor.white,
    .paragraphStyle: paragraph,
]

for sheetStart in stride(from: 0, to: frameURLs.count, by: framesPerSheet) {
    let sheetFrames = Array(
        frameURLs[sheetStart..<min(sheetStart + framesPerSheet, frameURLs.count)]
    )
    let sheetRows = Int(ceil(Double(sheetFrames.count) / Double(columns)))
    let canvasSize = NSSize(
        width: columns * cellWidth,
        height: sheetRows * (imageHeight + labelHeight)
    )
    let canvas = NSImage(size: canvasSize)
    canvas.lockFocus()
    NSColor.black.setFill()
    NSRect(origin: .zero, size: canvasSize).fill()

    for (offset, frameURL) in sheetFrames.enumerated() {
        guard let frame = NSImage(contentsOf: frameURL) else {
            fail("could not reopen frame: \(frameURL.path)")
        }
        let column = offset % columns
        let row = offset / columns
        let x = column * cellWidth
        let y = Int(canvasSize.height) - (row + 1) * (imageHeight + labelHeight)
        let imageRect = NSRect(
            x: x,
            y: y + labelHeight,
            width: cellWidth,
            height: imageHeight
        )
        frame.draw(
            in: imageRect,
            from: .zero,
            operation: .copy,
            fraction: 1.0,
            respectFlipped: true,
            hints: [.interpolation: NSImageInterpolation.high]
        )
        let globalIndex = sheetStart + offset
        let label = "#\(globalIndex)  \(timestamp(sampleTimes[globalIndex]))"
        label.draw(
            in: NSRect(x: x, y: y + 3, width: cellWidth, height: labelHeight - 3),
            withAttributes: labelAttributes
        )
    }
    canvas.unlockFocus()

    guard let tiff = canvas.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else {
        fail("could not encode contact sheet")
    }
    let sheetNumber = sheetStart / framesPerSheet + 1
    let sheetURL = outputURL.appendingPathComponent(
        String(format: "contact-sheet-%02d.png", sheetNumber)
    )
    try png.write(to: sheetURL, options: .atomic)
}

print(
    "extracted \(frameURLs.count) frames across " +
    "\(Int(ceil(Double(frameURLs.count) / Double(framesPerSheet)))) contact sheets " +
    "from \(String(format: "%.3f", duration)) seconds"
)
