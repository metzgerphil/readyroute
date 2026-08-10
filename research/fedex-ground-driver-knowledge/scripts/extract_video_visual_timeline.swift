#!/usr/bin/env swift

import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

func usage() -> Never {
    FileHandle.standardError.write(Data("usage: extract_video_visual_timeline.swift INPUT.mp4 OUTPUT_DIR [INTERVAL_SECONDS]\n".utf8))
    exit(2)
}

func escapeTSV(_ value: String) -> String {
    value
        .replacingOccurrences(of: "\t", with: " ")
        .replacingOccurrences(of: "\r", with: " ")
        .replacingOccurrences(of: "\n", with: " | ")
}

func writeJPEG(_ image: CGImage, to url: URL) throws {
    guard let destination = CGImageDestinationCreateWithURL(
        url as CFURL,
        UTType.jpeg.identifier as CFString,
        1,
        nil
    ) else {
        throw NSError(domain: "ReadyRouteVideoReview", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "Could not create JPEG destination at \(url.path)"
        ])
    }
    CGImageDestinationAddImage(destination, image, [
        kCGImageDestinationLossyCompressionQuality: 0.88
    ] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else {
        throw NSError(domain: "ReadyRouteVideoReview", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "Could not finalize JPEG at \(url.path)"
        ])
    }
}

func recognizeText(_ image: CGImage) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .fast
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-US"]
    request.usesCPUOnly = true
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try handler.perform([request])
    let observations = request.results ?? []
    return observations
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: " | ")
}

let arguments = CommandLine.arguments
guard arguments.count == 3 || arguments.count == 4 else { usage() }

let inputURL = URL(fileURLWithPath: arguments[1]).standardizedFileURL
let outputURL = URL(fileURLWithPath: arguments[2]).standardizedFileURL
let interval = arguments.count == 4 ? (Double(arguments[3]) ?? 3.0) : 3.0
guard interval > 0 else { usage() }

let fileManager = FileManager.default
try fileManager.createDirectory(at: outputURL, withIntermediateDirectories: true)

let asset = AVURLAsset(url: inputURL)
let duration = CMTimeGetSeconds(asset.duration)
guard duration.isFinite && duration > 0 else {
    throw NSError(domain: "ReadyRouteVideoReview", code: 3, userInfo: [
        NSLocalizedDescriptionKey: "Could not determine video duration for \(inputURL.path)"
    ])
}

let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
generator.maximumSize = CGSize(width: 1280, height: 1280)

var rows = ["sample_index\ttime_seconds\tframe_file\tocr_text"]
var index = 0
var second = 0.0

while second < duration {
    let time = CMTime(seconds: second, preferredTimescale: 600)
    var actualTime = CMTime.zero
    let image = try generator.copyCGImage(at: time, actualTime: &actualTime)
    let actualSecond = CMTimeGetSeconds(actualTime)
    let frameName = String(format: "frame-%04d-%07.2fs.jpg", index, actualSecond)
    try writeJPEG(image, to: outputURL.appendingPathComponent(frameName))
    let text: String
    do {
        text = try recognizeText(image)
    } catch {
        text = "[OCR_ERROR: \(error)]"
    }
    rows.append("\(index)\t\(String(format: "%.3f", actualSecond))\t\(frameName)\t\(escapeTSV(text))")
    index += 1
    second += interval
}

let tailSecond = max(0, duration - 0.15)
if tailSecond > 0, (tailSecond - (second - interval)) > 0.25 {
    let time = CMTime(seconds: tailSecond, preferredTimescale: 600)
    var actualTime = CMTime.zero
    let image = try generator.copyCGImage(at: time, actualTime: &actualTime)
    let actualSecond = CMTimeGetSeconds(actualTime)
    let frameName = String(format: "frame-%04d-%07.2fs.jpg", index, actualSecond)
    try writeJPEG(image, to: outputURL.appendingPathComponent(frameName))
    let text: String
    do {
        text = try recognizeText(image)
    } catch {
        text = "[OCR_ERROR: \(error)]"
    }
    rows.append("\(index)\t\(String(format: "%.3f", actualSecond))\t\(frameName)\t\(escapeTSV(text))")
}

let timelineURL = outputURL.appendingPathComponent("visual_timeline.tsv")
try (rows.joined(separator: "\n") + "\n").write(to: timelineURL, atomically: true, encoding: .utf8)

print("wrote \(rows.count - 1) visual samples to \(outputURL.path)")
