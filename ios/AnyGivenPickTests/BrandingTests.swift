import UIKit
import XCTest
@testable import AnyGivenPick

@MainActor
final class BrandingTests: XCTestCase {
  func testApprovedBrandMarkIsBundledForInAppViews() throws {
    let mark = try XCTUnwrap(UIImage(named: AppBrandMark.assetName))
    XCTAssertEqual(mark.size.width, mark.size.height)
    XCTAssertGreaterThanOrEqual(mark.size.width * mark.scale, 512)
  }

  func testLaunchScreenUsesTheSameApprovedMark() throws {
    XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "UILaunchStoryboardName") as? String, "LaunchScreen")
    let controller = try XCTUnwrap(UIStoryboard(name: "LaunchScreen", bundle: .main).instantiateInitialViewController())
    controller.loadViewIfNeeded()
    let image = try XCTUnwrap(controller.view.subviews.compactMap { $0 as? UIImageView }.first)
    XCTAssertEqual(image.accessibilityLabel, "Any Given Pick")
    XCTAssertEqual(image.contentMode, .scaleAspectFit)
    XCTAssertEqual(image.image?.pngData(), UIImage(named: AppBrandMark.assetName)?.pngData())
  }

  func testInAppMarkHasNoOpaqueAppIconTile() throws {
    let mark = try XCTUnwrap(UIImage(named: AppBrandMark.assetName))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    let image = UIGraphicsImageRenderer(size: CGSize(width: 64, height: 64), format: format).image { _ in
      mark.draw(in: CGRect(x: 0, y: 0, width: 64, height: 64))
    }
    let cgImage = try XCTUnwrap(image.cgImage)
    var pixels = [UInt8](repeating: 0, count: 64 * 64 * 4)
    try pixels.withUnsafeMutableBytes { bytes in
      let context = try XCTUnwrap(CGContext(
        data: bytes.baseAddress, width: 64, height: 64,
        bitsPerComponent: 8, bytesPerRow: 64 * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      ))
      context.draw(cgImage, in: CGRect(x: 0, y: 0, width: 64, height: 64))
    }
    for (x, y) in [(0, 0), (32, 0), (63, 0), (0, 32), (63, 32), (0, 63), (32, 63), (63, 63)] {
      XCTAssertEqual(pixels[(y * 64 + x) * 4 + 3], 0, "The area outside the cards must stay transparent.")
    }
    XCTAssertEqual(pixels[(32 * 64 + 32) * 4 + 3], 255, "The card artwork must remain visible.")
  }
}
