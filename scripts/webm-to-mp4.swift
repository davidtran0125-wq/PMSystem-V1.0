// Ghép một thư mục ảnh PNG thành MP4 H.264 bằng AVFoundation của macOS.
//
// Máy không có ffmpeg bản đầy đủ; bản ffmpeg đi kèm Playwright chỉ mã hoá được
// VP8. AVFoundation thì luôn có sẵn trên macOS và mã hoá H.264 bằng phần cứng,
// nên đây là đường ngắn nhất để ra file MP4 mở được ở mọi nơi.
//
//   swiftc -O scripts/webm-to-mp4.swift -o /tmp/png2mp4
//   /tmp/png2mp4 <thư-mục-png> <file-ra.mp4> <fps> [chiều-rộng] [bitrate]

import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

let args = CommandLine.arguments
guard args.count >= 4,
      let fps = Int32(args[3]) else {
    FileHandle.standardError.write(
        "Dùng: png2mp4 <thư-mục-png> <ra.mp4> <fps> [chiều-rộng] [bitrate]\n".data(using: .utf8)!
    )
    exit(2)
}
let targetWidth = args.count > 4 ? Int(args[4]) : nil
let bitrate = args.count > 5 ? (Int(args[5]) ?? 1_500_000) : 1_500_000

let frameDir = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2])
try? FileManager.default.removeItem(at: outputURL)

let frames = try FileManager.default
    .contentsOfDirectory(at: frameDir, includingPropertiesForKeys: nil)
    .filter { $0.pathExtension.lowercased() == "png" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }

guard !frames.isEmpty else {
    FileHandle.standardError.write("Không tìm thấy ảnh PNG nào trong \(frameDir.path)\n".data(using: .utf8)!)
    exit(1)
}

func loadImage(_ url: URL) -> CGImage? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

guard let first = loadImage(frames[0]) else {
    FileHandle.standardError.write("Không đọc được ảnh đầu tiên\n".data(using: .utf8)!)
    exit(1)
}
// Ảnh chụp giao diện nén rất tốt, thu nhỏ một chút là file nhẹ hẳn mà chữ vẫn
// đọc được. H.264 cần chiều rộng và cao chẵn.
let scale = targetWidth.map { Double($0) / Double(first.width) } ?? 1.0
var width = Int((Double(first.width) * scale).rounded())
var height = Int((Double(first.height) * scale).rounded())
width -= width % 2
height -= height % 2

let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [
        // Đủ nét để đọc chữ trên giao diện mà file vẫn gọn.
        AVVideoAverageBitRateKey: bitrate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoMaxKeyFrameIntervalKey: fps * 2,
    ],
]

let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: input,
    sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
    ]
)
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let colorSpace = CGColorSpaceCreateDeviceRGB()
var index: Int64 = 0
let queue = DispatchQueue(label: "png2mp4")
let done = DispatchSemaphore(value: 0)

input.requestMediaDataWhenReady(on: queue) {
    while input.isReadyForMoreMediaData {
        if index >= Int64(frames.count) {
            input.markAsFinished()
            writer.finishWriting { done.signal() }
            return
        }

        guard let image = loadImage(frames[Int(index)]),
              let pool = adaptor.pixelBufferPool else {
            index += 1
            continue
        }

        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
        guard let pixelBuffer = buffer else { index += 1; continue }

        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        if let context = CGContext(
            data: CVPixelBufferGetBaseAddress(pixelBuffer),
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
                | CGBitmapInfo.byteOrder32Little.rawValue
        ) {
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        CVPixelBufferUnlockBaseAddress(pixelBuffer, [])

        adaptor.append(
            pixelBuffer,
            withPresentationTime: CMTime(value: index, timescale: fps)
        )
        index += 1

        if index % 200 == 0 {
            print("  \(index)/\(frames.count) khung hình")
            fflush(stdout)
        }
    }
}

done.wait()

if writer.status == .completed {
    let attrs = try? FileManager.default.attributesOfItem(atPath: outputURL.path)
    let size = (attrs?[.size] as? Int) ?? 0
    let mb = String(format: "%.1f", Double(size) / 1_048_576)
    print("Xong: \(outputURL.path) (\(mb) MB, \(frames.count) khung hình)")
} else {
    FileHandle.standardError.write(
        "Đóng gói thất bại: \(writer.error?.localizedDescription ?? "không rõ lý do")\n".data(using: .utf8)!
    )
    exit(1)
}
