#!/usr/bin/env swift

import AppKit
import Foundation

func usage() -> Never {
    FileHandle.standardError.write(Data("usage: build_video_contact_sheets.swift FRAME_DIR OUTPUT_DIR [COLUMNS] [ROWS]\n".utf8))
    exit(2)
}

let arguments = CommandLine.arguments
guard (3...5).contains(arguments.count) else { usage() }

let frameDirectory = URL(fileURLWithPath: arguments[1]).standardizedFileURL
let outputDirectory = URL(fileURLWithPath: arguments[2]).standardizedFileURL
let columns = arguments.count >= 4 ? (Int(arguments[3]) ?? 4) : 4
let rows = arguments.count >= 5 ? (Int(arguments[4]) ?? 4) : 4
guard columns > 0 && rows > 0 else { usage() }

let fileManager = FileManager.default
try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
let frameURLs = try fileManager.contentsOfDirectory(
    at: frameDirectory,
    includingPropertiesForKeys: nil
).filter { $0.lastPathComponent.hasPrefix("frame-") && $0.pathExtension.lowercased() == "jpg" }
 .sorted { $0.lastPathComponent < $1.lastPathComponent }

guard !frameURLs.isEmpty else {
    throw NSError(domain: "ReadyRouteVideoReview", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "No frame JPEGs found in \(frameDirectory.path)"
    ])
}

let cellWidth = 400
let cellHeight = 300
let labelHeight = 28
let pageSize = columns * rows
let pageCount = Int(ceil(Double(frameURLs.count) / Double(pageSize)))
let textAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.monospacedSystemFont(ofSize: 15, weight: .medium),
    .foregroundColor: NSColor.white
]

for pageIndex in 0..<pageCount {
    let start = pageIndex * pageSize
    let end = min(start + pageSize, frameURLs.count)
    let pageFrames = Array(frameURLs[start..<end])
    let image = NSImage(size: NSSize(width: columns * cellWidth, height: rows * cellHeight))
    image.lockFocus()
    NSColor.black.setFill()
    NSRect(origin: .zero, size: image.size).fill()

    for (index, frameURL) in pageFrames.enumerated() {
        guard let frame = NSImage(contentsOf: frameURL) else { continue }
        let column = index % columns
        let row = index / columns
        let x = column * cellWidth
        let y = (rows - row - 1) * cellHeight
        let imageRect = NSRect(
            x: x,
            y: y + labelHeight,
            width: cellWidth,
            height: cellHeight - labelHeight
        )
        frame.draw(
            in: imageRect,
            from: .zero,
            operation: .copy,
            fraction: 1.0,
            respectFlipped: true,
            hints: [.interpolation: NSImageInterpolation.high]
        )
        let label = frameURL.deletingPathExtension().lastPathComponent
        label.draw(
            in: NSRect(x: x + 8, y: y + 5, width: cellWidth - 16, height: labelHeight - 6),
            withAttributes: textAttributes
        )
    }
    image.unlockFocus()

    guard let tiff = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(domain: "ReadyRouteVideoReview", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "Could not encode contact sheet \(pageIndex + 1)"
        ])
    }
    let outputURL = outputDirectory.appendingPathComponent(
        String(format: "contact-sheet-%02d.png", pageIndex + 1)
    )
    try png.write(to: outputURL, options: .atomic)
}

print("wrote \(pageCount) contact sheets for \(frameURLs.count) frames to \(outputDirectory.path)")
