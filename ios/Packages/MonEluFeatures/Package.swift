// swift-tools-version: 6.0
import PackageDescription

// The app's screens (#432): each feature's models, its service over the
// generated API client, and its views. Depends on everything below it; the
// app target only wires tabs and routes to these screens.
let package = Package(
    name: "MonEluFeatures",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "MonEluFeatures", targets: ["MonEluFeatures"]),
    ],
    dependencies: [
        .package(path: "../MonEluCore"),
        .package(path: "../MonEluAPI"),
        .package(path: "../MonEluUI"),
        .package(url: "https://github.com/pointfreeco/swift-snapshot-testing", exact: "1.19.6"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", exact: "1.12.2"),
    ],
    targets: [
        .target(
            name: "MonEluFeatures",
            dependencies: [
                "MonEluCore",
                "MonEluAPI",
                "MonEluUI",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
            ]
        ),
        .testTarget(
            name: "MonEluFeaturesTests",
            dependencies: [
                "MonEluFeatures",
                "MonEluCore",
                "MonEluAPI",
                "MonEluUI",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "SnapshotTesting", package: "swift-snapshot-testing"),
            ],
            exclude: ["__Snapshots__"],
            // Responses recorded from the production API.
            resources: [.copy("Fixtures")]
        ),
    ]
)
