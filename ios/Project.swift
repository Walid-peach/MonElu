import ProjectDescription

// The Xcode project is generated from this file by `make ios-generate` and is
// git-ignored (ADR-041). Change the app's structure here, never in Xcode.

let packageNames = ["MonEluAPI", "MonEluCore", "MonEluUI", "MonEluAccount"]

let swiftSettings: SettingsDictionary = [
    "SWIFT_VERSION": "6.0",
    "SWIFT_STRICT_CONCURRENCY": "complete",
    "ENABLE_USER_SCRIPT_SANDBOXING": "YES",
]

let project = Project(
    name: "MonElu",
    options: .options(
        automaticSchemesOptions: .disabled,
        developmentRegion: "fr"
    ),
    packages: packageNames.map { .package(path: "Packages/\($0)") },
    settings: .settings(
        base: swiftSettings,
        configurations: [
            .debug(name: .debug, xcconfig: "Configs/App.xcconfig"),
            .release(name: .release, xcconfig: "Configs/App.xcconfig"),
        ]
    ),
    targets: [
        .target(
            name: "MonElu",
            destinations: [.iPhone],
            product: .app,
            // Set once the App Store publisher is decided (#431); see Configs/App.xcconfig.
            bundleId: "$(MONELU_BUNDLE_ID)",
            deploymentTargets: .iOS("17.0"),
            infoPlist: .extendingDefault(with: [
                "CFBundleDisplayName": "MonÉlu",
                "CFBundleShortVersionString": "$(MARKETING_VERSION)",
                "CFBundleVersion": "$(CURRENT_PROJECT_VERSION)",
                "MonEluAPIBaseURL": "$(MONELU_API_BASE_URL)",
                "UILaunchScreen": [:],
                // monelu://deputes/<id> and monelu://votes/<id> open a screen
                // (AppRoute); universal links will reuse the same parser.
                "CFBundleURLTypes": [
                    [
                        "CFBundleURLName": "$(MONELU_BUNDLE_ID)",
                        "CFBundleURLSchemes": ["monelu"],
                    ],
                ],
                "UISupportedInterfaceOrientations": ["UIInterfaceOrientationPortrait"],
            ]),
            sources: ["MonElu/Sources/**"],
            dependencies: packageNames.map { .package(product: $0) }
        ),
        .target(
            name: "MonEluTests",
            destinations: [.iPhone],
            product: .unitTests,
            bundleId: "$(MONELU_BUNDLE_ID).tests",
            deploymentTargets: .iOS("17.0"),
            infoPlist: .default,
            sources: ["MonElu/Tests/**"],
            dependencies: [.target(name: "MonElu")]
        ),
    ],
    schemes: [
        .scheme(
            name: "MonElu",
            shared: true,
            buildAction: .buildAction(targets: ["MonElu"]),
            testAction: .targets(["MonEluTests"]),
            runAction: .runAction(executable: "MonElu")
        ),
    ]
)
