import SwiftUI
import Foundation
import Lottie
// If you see 'Cannot find type ... in scope', ensure ScheduleModels.swift, ScheduleLoader.swift, and ScheduleTypeFetcher.swift are in the same target/module as this file.
// import SJA_re // Uncomment if you have a module named SJA_re
// ---
// To test the schedule at a specific time, set testTime below to a Date value.
// Example: let testTime = Calendar.current.date(bySettingHour: 8, minute: 30, second: 0, of: Date())
// If testTime is nil, the real current time is used.
// ---

// MARK: - Lottie Animation View
struct LottieView: UIViewRepresentable {
    let animationName: String
    let loopMode: LottieLoopMode
    let completion: (() -> Void)?
    
    init(animationName: String, loopMode: LottieLoopMode = .playOnce, completion: (() -> Void)? = nil) {
        self.animationName = animationName
        self.loopMode = loopMode
        self.completion = completion
    }
    
    func makeUIView(context: Context) -> UIView {
        // Reduced logging to avoid splash screen interference
        let view = UIView(frame: .zero)
        
        let animationView = LottieAnimationView()
        animationView.contentMode = .scaleAspectFit
        animationView.loopMode = loopMode
        
        view.addSubview(animationView)
        animationView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            animationView.heightAnchor.constraint(equalTo: view.heightAnchor),
            animationView.widthAnchor.constraint(equalTo: view.widthAnchor)
        ])
        
        // Load animation and start playback immediately when ready
        // print("🔍 Attempting to load Lottie file: '\(animationName)'")
        let startTime = Date()
        
        DispatchQueue.main.async {
            // Load JSON animation
            animationView.animation = LottieAnimation.named(animationName)
            let loadTime = Date().timeIntervalSince(startTime)
            // print("🔍 JSON load time: \(loadTime) seconds")
            
            if animationView.animation == nil {
                // print("❌ ERROR: Could not load animation named '\(animationName)'")
                // print("❌ Make sure \(animationName).json is added to your Xcode project target")
            } else {
                // print("✅ Animation loaded successfully in \(loadTime) seconds")
                animationView.play { finished in
                    // print("🎊 Confetti animation completed!")
                    completion?()
                }
            }
        }
        
        return view
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
        // Update logic if needed
    }
}

// MARK: - Fast SwiftUI Confetti (Alternative)
struct SwiftUIConfettiView: View {
    @Binding var showSplashScreen: Bool
    let onAnimationComplete: () -> Void
    let onAnimationStart: () -> Void
    @State private var shouldStartAnimation = false
    @State private var confettiPieces: [ConfettiPiece] = []
    
    var body: some View {
        ZStack {
            if shouldStartAnimation {
                ForEach(confettiPieces) { piece in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(piece.color)
                        .frame(width: piece.size.width, height: piece.size.height)
                        .position(x: piece.position.x, y: piece.position.y)
                        .rotationEffect(.degrees(piece.rotation))
                        .opacity(piece.opacity)
                }
            }
        }
        .onAppear {
            if !showSplashScreen {
                startAnimation()
            }
        }
        .onChange(of: showSplashScreen) { newValue in
            if !newValue && !shouldStartAnimation {
                startAnimation()
            }
        }
    }
    
    private func startAnimation() {
        // print("🎊 Starting FAST SwiftUI confetti!")
        shouldStartAnimation = true
        onAnimationStart()
        createConfetti()
        animateConfetti()
    }
    
    private func createConfetti() {
        let colors: [Color] = [.green, .white, Color.green.opacity(0.7), Color.white.opacity(0.9)]
        confettiPieces = []
        
        for i in 0..<50 {
            let piece = ConfettiPiece(
                id: UUID(),
                color: colors.randomElement()!,
                position: CGPoint(x: CGFloat.random(in: 0...UIScreen.main.bounds.width), y: -20),
                size: CGSize(width: CGFloat.random(in: 8...16), height: CGFloat.random(in: 8...16)),
                rotation: Double.random(in: 0...360),
                opacity: Double.random(in: 0.7...1.0),
                fallSpeed: Double.random(in: 2...5),
                rotationSpeed: Double.random(in: 1...3)
            )
            confettiPieces.append(piece)
        }
    }
    
    private func animateConfetti() {
        withAnimation(.easeIn(duration: 0.5)) {
            for i in 0..<confettiPieces.count {
                confettiPieces[i].position.y += 100
                confettiPieces[i].rotation += 180
            }
        }
        
        Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { timer in
            var allPiecesOffScreen = true
            
            for i in 0..<confettiPieces.count {
                confettiPieces[i].position.y += confettiPieces[i].fallSpeed
                confettiPieces[i].rotation += confettiPieces[i].rotationSpeed
                confettiPieces[i].position.x += Double.random(in: -1...1)
                
                if confettiPieces[i].position.y > UIScreen.main.bounds.height * 0.8 {
                    confettiPieces[i].opacity = max(0, confettiPieces[i].opacity - 0.05)
                }
                
                if confettiPieces[i].position.y < UIScreen.main.bounds.height + 50 {
                    allPiecesOffScreen = false
                }
            }
            
            if allPiecesOffScreen {
                timer.invalidate()
                confettiPieces.removeAll()
                onAnimationComplete()
            }
        }
    }
}

struct ConfettiPiece: Identifiable {
    let id: UUID
    let color: Color
    var position: CGPoint
    let size: CGSize
    var rotation: Double
    var opacity: Double
    var fallSpeed: Double
    let rotationSpeed: Double
}

// MARK: - Confetti Animation View (Lottie Version)
struct ConfettiAnimationView: View {
    @Binding var showSplashScreen: Bool
    let onAnimationComplete: () -> Void
    let onAnimationStart: () -> Void
    @State private var shouldStartAnimation = false
    @State private var animationFinished = false
    
    var body: some View {
        ZStack {
            if shouldStartAnimation && !animationFinished {
                LottieView(animationName: "confetti_new", loopMode: .playOnce) {
                    // print("Confetti animation completed!")
                    animationFinished = true
                    onAnimationComplete()
                }
            }
        }
        .onAppear {
            if !showSplashScreen {
                startAnimation()
            }
        }
        .onChange(of: showSplashScreen) { newValue in
            if !newValue && !shouldStartAnimation {
                startAnimation()
            }
        }
    }
    
    private func startAnimation() {
        // print("🎊 Starting Lottie confetti animation!")
        shouldStartAnimation = true
        onAnimationStart() // Trigger text animation at the same time
    }
}

/*
// MARK: - Old Custom Confetti Code (commented out)
struct ConfettiView: View {
    @State private var confettiPieces: [ConfettiPiece] = []
    @State private var isAnimating = false
    @Binding var showSplashScreen: Bool
    let onConfettiComplete: () -> Void
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                ForEach(confettiPieces) { piece in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(piece.color)
                        .frame(width: piece.size.width, height: piece.size.height)
                        .position(x: piece.position.x, y: piece.position.y)
                        .rotationEffect(.degrees(piece.rotation))
                        .opacity(piece.opacity)
                }
            }
        }
        .onAppear {
            if !showSplashScreen {
                startConfettiAnimation()
            }
        }
        .onChange(of: showSplashScreen) { _ in
            if !showSplashScreen && !isAnimating {
                startConfettiAnimation()
            }
        }
    }
    
    private func startConfettiAnimation() {
        guard !isAnimating else { return }
        isAnimating = true
        
        // Wait a bit after splash screen disappears
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            createConfettiPieces()
            animateConfetti()
        }
    }
    
    private func createConfettiPieces() {
        let colors: [Color] = [.green, .white, Color.green.opacity(0.7), Color.white.opacity(0.9)]
        
        for i in 0..<50 {
            let piece = ConfettiPiece(
                id: UUID(),
                color: colors.randomElement()!,
                position: CGPoint(x: CGFloat.random(in: 0...UIScreen.main.bounds.width), y: -20),
                size: CGSize(width: CGFloat.random(in: 8...16), height: CGFloat.random(in: 8...16)),
                rotation: Double.random(in: 0...360),
                opacity: Double.random(in: 0.7...1.0),
                fallSpeed: Double.random(in: 2...5),
                rotationSpeed: Double.random(in: 1...3)
            )
            confettiPieces.append(piece)
        }
    }
    
    private func animateConfetti() {
        withAnimation(.easeIn(duration: 0.5)) {
            // Initial burst effect
            for i in 0..<confettiPieces.count {
                confettiPieces[i].position.y += 100
                confettiPieces[i].rotation += 180
            }
        }
        
        // Continuous falling animation
        Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { timer in
            var allPiecesOffScreen = true
            
            for i in 0..<confettiPieces.count {
                confettiPieces[i].position.y += confettiPieces[i].fallSpeed
                confettiPieces[i].rotation += confettiPieces[i].rotationSpeed
                
                // Add some horizontal drift
                confettiPieces[i].position.x += Double.random(in: -1...1)
                
                // Fade out as they fall
                if confettiPieces[i].position.y > UIScreen.main.bounds.height * 0.8 {
                    confettiPieces[i].opacity = max(0, confettiPieces[i].opacity - 0.05)
                }
                
                if confettiPieces[i].position.y < UIScreen.main.bounds.height + 50 {
                    allPiecesOffScreen = false
                }
            }
            
            if allPiecesOffScreen {
                timer.invalidate()
                confettiPieces.removeAll()
                onConfettiComplete()
            }
        }
    }
}

struct ConfettiPiece: Identifiable {
    let id: UUID
    let color: Color
    var position: CGPoint
    let size: CGSize
    var rotation: Double
    var opacity: Double
    var fallSpeed: Double
    let rotationSpeed: Double
}
*/

/*
// MARK: - Commented Out Balloon Code
struct InteractiveBalloons: View {
    @State private var balloonOffset = CGSize.zero
    @State private var balloonScale: CGFloat = 1.0
    @State private var floatingOffset: CGFloat = 0
    @State private var isDragging = false
    @State private var entranceOffset: CGFloat = 500 // Start well below screen
    @State private var isExiting = false
    @State private var randomXOffset: CGFloat = 0
    @State private var randomYOffset: CGFloat = 0
    @State private var shouldShowBalloon = false
    @Binding var disablePullToRefresh: Bool
    @Binding var showSplashScreen: Bool
    let onBalloonExited: () -> Void
    
    var body: some View {
        GeometryReader { geometry in
            let screenWidth = geometry.size.width
            let screenHeight = geometry.size.height
            
            ZStack {
                if shouldShowBalloon {
                    // Single Green Foil Balloon (centered, bigger)
                    RealBalloon(imageName: "green-balloon")
                        .offset(x: balloonOffset.width + floatingOffset + randomXOffset, 
                               y: balloonOffset.height + floatingOffset * 0.5 + entranceOffset + randomYOffset)
                        .position(x: screenWidth * 0.5, y: screenHeight * 0.55) // Centered, positioned to stop before text
                        .scaleEffect(balloonScale)
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                if !isDragging {
                                    isDragging = true
                                    disablePullToRefresh = true // Disable pull-to-refresh when dragging balloon
                                    // Haptic feedback on start
                                    let impactFeedback = UIImpactFeedbackGenerator(style: .medium)
                                    impactFeedback.impactOccurred()
                                    
                                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                                        balloonScale = 0.85
                                    }
                                }
                                balloonOffset = value.translation
                            }
                            .onEnded { value in
                                isDragging = false
                                disablePullToRefresh = false // Re-enable pull-to-refresh when balloon drag ends
                                
                                // Strong haptic feedback on release
                                let impactFeedback = UIImpactFeedbackGenerator(style: .heavy)
                                impactFeedback.impactOccurred()
                                
                                // Launch balloon off screen
                                launchBalloonAway()
                            }
                    )
                }
            }
        }
        .onAppear {
            checkForBalloonSpawn()
        }
        .onChange(of: showSplashScreen) { _ in
            checkForBalloonSpawn()
        }
    }
    
    private func checkForBalloonSpawn() {
        // Only spawn balloon if splash screen is gone and balloon hasn't been spawned yet
        if !showSplashScreen && !shouldShowBalloon {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                shouldShowBalloon = true
                startEntranceAnimation()
            }
        }
    }
    
    private func startEntranceAnimation() {
        // Randomize spawn position (±50px on both axes)
        randomXOffset = CGFloat.random(in: -50...50)
        randomYOffset = CGFloat.random(in: -50...50)
        
        // Entrance animation - balloon floats up from bottom
        withAnimation(.spring(response: 1.2, dampingFraction: 0.7)) {
            entranceOffset = 0
        }
        
        // Start gentle floating animation after entrance
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            withAnimation(.easeInOut(duration: 3.0).repeatForever(autoreverses: true)) {
                floatingOffset = 15
            }
        }
    }
    
    private func launchBalloonAway() {
        // Launch balloon completely off screen slower than entrance
        withAnimation(.spring(response: 2.0, dampingFraction: 0.7)) {
            entranceOffset = -800 // Go way off top of screen to completely disappear
            balloonScale = 1.2 // Grow slightly as it flies away
        }
        
        // Notify when balloon has exited after animation completes
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            onBalloonExited()
        }
        
        // No respawn - balloon stays gone
    }
}

struct Balloon3D: View {
    let color: Color
    let scale: CGFloat
    
    var body: some View {
        ZStack {
            // Balloon shadow
            Ellipse()
                .fill(Color.black.opacity(0.2))
                .frame(width: 60 * scale, height: 80 * scale)
                .offset(x: 3, y: 5)
                .blur(radius: 3)
            
            // Main balloon body
            Ellipse()
                .fill(
                    RadialGradient(
                        colors: [
                            color.opacity(0.9),
                            color,
                            color.opacity(0.7)
                        ],
                        center: UnitPoint(x: 0.3, y: 0.3),
                        startRadius: 5,
                        endRadius: 35
                    )
                )
                .frame(width: 60 * scale, height: 80 * scale)
                .overlay(
                    // Highlight shine
                    Ellipse()
                        .fill(
                            RadialGradient(
                                colors: [Color.white.opacity(0.6), Color.clear],
                                center: UnitPoint(x: 0.3, y: 0.2),
                                startRadius: 2,
                                endRadius: 15
                            )
                        )
                        .frame(width: 20 * scale, height: 25 * scale)
                        .offset(x: -10, y: -15)
                )
            
            // Balloon string
            Rectangle()
                .fill(Color.gray.opacity(0.8))
                .frame(width: 1, height: 40 * scale)
                .offset(y: 40 * scale + 20)
            
            // String knot
            Circle()
                .fill(Color.gray.opacity(0.9))
                .frame(width: 3 * scale, height: 3 * scale)
                .offset(y: 40 * scale + 15)
        }
    }
}

struct RealBalloon: View {
    let imageName: String
    
    var body: some View {
        ZStack {
            // Balloon shadow
            Image(imageName)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 400, height: 400) // Made even bigger
                .offset(x: 3, y: 5)
                .opacity(0.3)
                .blur(radius: 3)
            
            // Main balloon image
            Image(imageName)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 400, height: 400) // Made even bigger
        }
    }
}
*/

struct ScheduleView: View {
    let testDate: Date?
    @Binding var noSchool: Bool
    @Binding var isStale: Bool
    @ObservedObject var loader: ScheduleLoader
    let onLoadingComplete: () -> Void
    let onPullRefresh: () async -> Void
    @Binding var showSplashScreen: Bool
    @Binding var disablePullToRefreshGesture: Bool
    let currentDayType: String
    let currentDayTypeDate: Date?
    @ObservedObject private var blockManager = BlockSettingsManager.shared
    @ObservedObject private var schedulePrefsManager = SchedulePreferencesManager.shared
    @State private var expandedBlockID: UUID?
    @State private var now = Date.currentEST
    @State private var scheduleTitle: String = "Loading..."
    @State private var timeUpdateTimer: Timer?
    @State private var noSchoolDetails: String? = nil
    @State private var disablePullToRefresh = false
    @State private var showNoSchoolText = false
    @State private var showDetailsText = false
    @State private var hasStartedTextAnimation = false
    @State private var shouldShowConfetti = false
    @State private var viewingGrade: GradeLevel? = nil
    @State private var showGradePrompt: Bool = false
    @State private var hasStartedLoad = false
    @EnvironmentObject private var router: NavigationRouter

    


    // Use this everywhere instead of 'now'
    var currentTime: Date {
        testDate ?? now
    }
    
    // True when any block in today's schedule is restricted to specific grades.
    var hasGradeSpecificBlocks: Bool {
        loader.blocks.contains { ($0.grades?.isEmpty == false) }
    }

    // Filter the day's blocks down to the grade currently being viewed (if any).
    // When the schedule has no grade-specific blocks, or the user has not picked
    // a grade yet, return everything unchanged.
    var displayBlocks: [Block] {
        guard hasGradeSpecificBlocks, let g = viewingGrade else { return loader.blocks }
        return loader.blocks.filter { block in
            guard let grades = block.grades, !grades.isEmpty else { return true }
            return grades.contains(g.rawValue)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            if noSchool {
                ZStack {
                    VStack(alignment: .leading, spacing: 0) {
                        VStack(spacing: 6) {
                            Text("No School")
                                .font(.system(size: 40, weight: .bold, design: .rounded))
                                .foregroundColor(HT.green)
                                .opacity(showNoSchoolText ? 1 : 0)
                                .scaleEffect(showNoSchoolText ? 1 : 0.8)
                                .animation(.spring(response: 0.6, dampingFraction: 0.7), value: showNoSchoolText)

                            if let details = noSchoolDetails, !details.isEmpty {
                                Text(details)
                                    .font(.title3)
                                    .foregroundColor(.secondary)
                                    .multilineTextAlignment(.center)
                                    .opacity(showDetailsText ? 1 : 0)
                                    .scaleEffect(showDetailsText ? 1 : 0.8)
                                    .animation(.spring(response: 0.6, dampingFraction: 0.7).delay(0.3), value: showDetailsText)
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }

                    // Simple Confetti Animation
                    if shouldShowConfetti {
                        ConfettiAnimationView(
                            showSplashScreen: $showSplashScreen,
                            onAnimationComplete: {},
                            onAnimationStart: {
                                // Start text animation when confetti starts
                                if !hasStartedTextAnimation {
                                    hasStartedTextAnimation = true
                                    startTextAnimation()
                                }
                            }
                        )
                        .frame(height: 600)
                        .allowsHitTesting(false)
                    }
                }
                .frame(height: 600)
                .onAppear {
                    if noSchool && !hasStartedTextAnimation {
                        checkConfettiAndStartText()
                    }
                }
                .onChange(of: noSchool) { _ in
                    if noSchool && !hasStartedTextAnimation {
                        checkConfettiAndStartText()
                    }
                    updateCountdownWidget()
                }
                .onChange(of: noSchoolDetails) { _ in
                    if noSchool, let details = noSchoolDetails, !details.isEmpty {
                        showDetailsText = true
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    countdown
                    scheduleCard
                }
                .opacity(loader.showBlocks ? 1 : 0)
                .animation(.easeOut(duration: 0.25), value: loader.showBlocks)
            }
        }
        .onAppear {
            startTimeUpdateTimer()
            // Switching back to this tab fires onAppear again; `.id(refreshID)` gives
            // a real refresh a new view, and so a new `hasStartedLoad`.
            guard !hasStartedLoad else { return }
            hasStartedLoad = true
            loader.showBlocks = false
            syncViewingGradeFromPrefs()
            evaluateGradePrompt()
            Task {
                // Delay loading if splash screen is showing to let animation complete
                if showSplashScreen {
                    do {
                        try await Task.sleep(nanoseconds: 800_000_000) // 0.8 seconds
                        await refreshSchedule()
                    } catch {
                        // If cancelled, proceed immediately
                        await refreshSchedule()
                    }
                } else {
                    await refreshSchedule()
                }
            }
        }
        .onDisappear {
            stopTimeUpdateTimer()
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("BlockSettingsChanged"))) { _ in
            updateCountdownWidget()
        }
        .onChange(of: currentDayType) { _ in
            updateCountdownWidget()
        }
        .onChange(of: router.selectedTab) { tab in
            if tab != .today { expandedBlockID = nil }
        }
        .onChange(of: currentDayTypeDate) { _ in
            updateCountdownWidget()
        }
        .onChange(of: loader.blocks.count) { _ in
            syncViewingGradeFromPrefs()
            evaluateGradePrompt()
        }
        .onChange(of: schedulePrefsManager.preferences.graduationYear) { _ in
            syncViewingGradeFromPrefs()
            evaluateGradePrompt()
        }
        .sheet(isPresented: $showGradePrompt) {
            GradePromptSheet { grade in
                var prefs = schedulePrefsManager.preferences
                prefs.graduationYear = graduationYear(from: grade)
                schedulePrefsManager.preferences = prefs
                Task { await schedulePrefsManager.savePreferences() }
                viewingGrade = grade
                showGradePrompt = false
            }
            .presentationDetents([.medium])
            .interactiveDismissDisabled(true)
        }
    }

    // MARK: - Today's cards

    private var timeFormat: TimeFormat { schedulePrefsManager.preferences.timeFormat }

    /// Which block the time belongs to and what happens when it runs out, so class
    /// and the break between classes can't be mistaken for each other.
    @ViewBuilder
    private var countdown: some View {
        if let (block, seconds) = currentBlockInfo() {
            countdownRow(name: getBlockDisplayName(for: block), verb: "Ends in", seconds: seconds)
        } else if let (block, seconds) = nextBlockInfo() {
            countdownRow(name: getBlockDisplayName(for: block), verb: "Starts in", seconds: seconds)
        } else {
            VStack(alignment: .leading, spacing: 2) {
                Text("School Ended")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundColor(HT.green)
                    .lineLimit(1)
                Text("Have a good day!")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 8)
        }
    }

    private func countdownRow(name: String, verb: String, seconds: Int) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.title3.weight(.semibold))
                    .lineLimit(1)
                Text(verb)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            Spacer(minLength: 0)
            Text(SchoolTime.countdown(seconds))
                .font(.system(size: 56, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundColor(HT.green)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .layoutPriority(1)
        }
        .padding(.horizontal, 10)
        .padding(.bottom, 8)
    }

    /// A weekday's name would only repeat the date in the header, so the card is
    /// titled just when the day runs on something special.
    private var specialScheduleTitle: String? {
        guard scheduleTitle != getWeekdayTitle() else { return nil }
        return scheduleTitle.lowercased() == "abdec" ? scheduleTitle.uppercased() : scheduleTitle
    }

    private var scheduleCard: some View {
        VStack(spacing: 2) {
            if specialScheduleTitle != nil || (hasGradeSpecificBlocks && viewingGrade != nil) {
                HStack {
                    if let title = specialScheduleTitle {
                        Text(title)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    if hasGradeSpecificBlocks, let grade = viewingGrade {
                        Menu {
                            ForEach(GradeLevel.allCases) { option in
                                Button(option.labelPlural) { viewingGrade = option }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Text(grade.labelPlural).fontWeight(.semibold)
                                Image(systemName: "chevron.down").font(.caption2)
                            }
                            .font(.footnote)
                            .foregroundColor(.secondary)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 4)
                .padding(.bottom, 6)
            }

            ForEach(displayBlocks) { block in
                blockRow(block)
            }
        }
        .card(padding: 8)
    }

    private func blockRow(_ block: Block) -> some View {
        let isNow = isCurrent(block: block)
        let isNext = isNextUpcomingBlock(block)
        let hasSubBlocks = block.subBlocks?.isEmpty == false
        let isExpanded = expandedBlockID == block.id

        return VStack(spacing: 2) {
            HStack(spacing: 8) {
                Text(getBlockDisplayName(for: block))
                    .font(.subheadline.weight(isNow || isNext ? .semibold : .regular))
                    .foregroundColor(isNow || isNext ? HT.green : getBlockTextColor(for: block))
                Spacer(minLength: 8)
                Text(SchoolTime.range(block.start, block.end, timeFormat))
                    .font(.footnote)
                    .monospacedDigit()
                    .foregroundColor(isNow || isNext ? HT.green : .secondary)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.secondary)
                    .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    .opacity(hasSubBlocks ? 1 : 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isNow ? HT.softGreen : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                    .foregroundColor(isNext ? Color.green : Color.clear)
            )
            .contentShape(Rectangle())
            .onTapGesture {
                guard hasSubBlocks else { return }
                withAnimation(.easeInOut(duration: 0.2)) {
                    expandedBlockID = isExpanded ? nil : block.id
                }
            }

            if isExpanded, let subBlocks = block.subBlocks {
                VStack(spacing: 0) {
                    ForEach(subBlocks) { sub in
                        subBlockRow(sub)
                    }
                }
                .padding(.bottom, 4)
                .transition(.opacity)
            }
        }
    }

    private func subBlockRow(_ sub: SubBlock) -> some View {
        let isMine = lunchWave(fromName: sub.name) == schedulePrefsManager.preferences.lunchWave
        let isNow = isCurrent(subBlock: sub)

        return HStack {
            Text(sub.name)
                .font(.footnote.weight(isMine ? .semibold : .regular))
            Spacer()
            Text(SchoolTime.range(sub.start, sub.end, timeFormat))
                .font(.footnote)
                .monospacedDigit()
            Image(systemName: "chevron.down")
                .font(.system(size: 10, weight: .bold))
                .opacity(0)
        }
        .foregroundColor(isMine ? HT.brightGreen : .secondary)
        .padding(.leading, 22)
        .padding(.trailing, 10)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(isNow ? HT.softGreen.opacity(0.6) : Color.clear)
        )
    }

    // MARK: - Grade prompt helpers

    /// Reset `viewingGrade` to whatever the user has saved in preferences (if anything).
    /// Called on first appear and when preferences change so the dropdown defaults to the user's grade.
    private func syncViewingGradeFromPrefs() {
        if let gradYear = schedulePrefsManager.preferences.graduationYear {
            viewingGrade = gradFromGraduationYear(gradYear)
        }
    }

    /// Show the first-launch grade picker when today's schedule has grade-specific blocks
    /// and the user hasn't picked a grade yet.
    private func evaluateGradePrompt() {
        guard hasGradeSpecificBlocks else {
            showGradePrompt = false
            return
        }
        if schedulePrefsManager.preferences.graduationYear == nil && !loader.blocks.isEmpty {
            showGradePrompt = true
        }
    }

    /// Convenience wrapper around the free function to avoid name collision in the closure.
    private func gradFromGraduationYear(_ y: Int) -> GradeLevel {
        gradeFromGraduationYear(y)
    }

    // Helper functions
    func isCurrent(block: Block) -> Bool {
        guard let start = timeToday(block.start), let end = timeToday(block.end) else { return false }
        return currentTime >= start && currentTime < end
    }

    func currentBlockInfo() -> (Block, Int)? {
        for block in displayBlocks {
            guard let start = timeToday(block.start), let end = timeToday(block.end) else { continue }
            if currentTime >= start && currentTime < end {
                let secondsLeft = Int(end.timeIntervalSince(currentTime))
                return (block, secondsLeft)
            }
        }
        return nil
    }

    func nextBlockInfo() -> (Block, Int)? {
        // Find the next block that hasn't started yet, and only if not currently in a block
        if displayBlocks.isEmpty { return nil }
        if displayBlocks.contains(where: isCurrent) { return nil }
        let futureBlocks = displayBlocks.compactMap { block -> (Block, Int)? in
            guard let start = timeToday(block.start) else { return nil }
            let diff = Int(start.timeIntervalSince(currentTime))
            return diff > 0 ? (block, diff) : nil
        }
        return futureBlocks.min(by: { $0.1 < $1.1 })
    }

    func timeToday(_ time: String) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        formatter.timeZone = Date.estTimeZone
        var calendar = Calendar.current
        calendar.timeZone = Date.estTimeZone
        guard let t = formatter.date(from: time) else { return nil }
        let comps = calendar.dateComponents([.year, .month, .day], from: currentTime)
        return calendar.date(bySettingHour: calendar.component(.hour, from: t), minute: calendar.component(.minute, from: t), second: 0, of: calendar.date(from: comps)!)
    }
    
    // Format time string (HH:mm) according to user's time format preference
    func formatTimeRange(start: String, end: String) -> String {
        let inputFormatter = DateFormatter()
        inputFormatter.dateFormat = "HH:mm"
        inputFormatter.timeZone = Date.estTimeZone
        
        let outputFormatter = DateFormatter()
        outputFormatter.timeZone = Date.estTimeZone
        
        // Set format based on user preference
        if schedulePrefsManager.preferences.timeFormat == .hour24 {
            outputFormatter.dateFormat = "HH:mm"
        } else {
            outputFormatter.dateFormat = "hh:mm" // 12-hour format with leading zero, without AM/PM
        }
        
        // Parse and format start time
        guard let startDate = inputFormatter.date(from: start),
              let endDate = inputFormatter.date(from: end) else {
            return "\(start)-\(end)" // Fallback to original if parsing fails
        }
        
        let formattedStart = outputFormatter.string(from: startDate)
        let formattedEnd = outputFormatter.string(from: endDate)
        
        return "\(formattedStart)-\(formattedEnd)"
    }

    func isNextBlock(index: Int) -> Bool {
        guard index >= 0, index < displayBlocks.count else { return false }
        guard !isCurrent(block: displayBlocks[index]) else { return false }
        let block = displayBlocks[index]
        let start = timeToday(block.start) ?? Date.distantFuture
        if index == 0 {
            // Before the first block
            return currentTime < start
        } else {
            let prevEnd = timeToday(displayBlocks[index - 1].end) ?? Date.distantPast
            return currentTime >= prevEnd && currentTime < start
        }
    }
    
    func isNextUpcomingBlock(_ block: Block) -> Bool {
        // Don't show dashed border if currently in a block
        if displayBlocks.contains(where: { isCurrent(block: $0) }) {
            return false
        }
        
        // Find if this block is the next upcoming one
        if let nextInfo = nextBlockInfo() {
            return block.id == nextInfo.0.id
        }
        
        return false
    }
    
    func isRegularClassBlock(_ blockName: String) -> Bool {
        // Check if it's a regular class block (A Block, B Block, C Block, etc.)
        let pattern = "^[A-Z] Block$"
        let regex = try? NSRegularExpression(pattern: pattern)
        let range = NSRange(location: 0, length: blockName.utf16.count)
        return regex?.firstMatch(in: blockName, options: [], range: range) != nil
    }

    func isCurrent(subBlock: SubBlock) -> Bool {
        guard let start = timeToday(subBlock.start), let end = timeToday(subBlock.end) else { return false }
        return currentTime >= start && currentTime < end
    }

    func currentSubBlockInfo() -> (parent: Block, sub: SubBlock, Int)? {
        for block in displayBlocks {
            guard let subBlocks = block.subBlocks else { continue }
            for sub in subBlocks {
                guard let start = timeToday(sub.start), let end = timeToday(sub.end) else { continue }
                if currentTime >= start && currentTime < end {
                    let secondsLeft = Int(end.timeIntervalSince(currentTime))
                    return (block, sub, secondsLeft)
                }
            }
        }
        return nil
    }

    func formatTime(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%d:%02d", m, s)
    }

    func loadWeekdaySchedule() {
        var calendar = Calendar.current
        calendar.timeZone = Date.estTimeZone
        let weekday = calendar.component(.weekday, from: currentTime)
        let weekdayNames = ["", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        // print("📅 [WEEKDAY] Loading weekday schedule for \(weekdayNames[weekday]) (weekday=\(weekday))")
        
        let scheduleFile: String?
        switch weekday {
        case 2: // Monday
            scheduleFile = "schedule_mon_thu"
        case 3: // Tuesday
            scheduleFile = "schedule_mon_thu"
        case 4: // Wednesday
            scheduleFile = "schedule_wed"
        case 5: // Thursday
            scheduleFile = "schedule_mon_thu"
        case 6: // Friday
            scheduleFile = "schedule_fri"
        default: // Saturday & Sunday
            scheduleFile = nil
        }
        
        if let file = scheduleFile {
            // print("📄 [WEEKDAY] Loading schedule from: \(file).json")
            loader.loadSchedule(from: file)
            // print("📋 [WEEKDAY] Loaded \(loader.blocks.count) blocks from \(file).json")
            noSchool = false
            noSchoolDetails = nil
        } else {
            // print("🚫 [WEEKDAY] Weekend - setting no school")
            loader.blocks = []
            noSchool = true
            noSchoolDetails = "Weekend" // Show "Weekend" as detail text
            showDetailsText = true  // 与 noSchoolDetails 同时设置，避免进入 app 时依赖 confetti 时序导致不显示
            // print("🔍 DEBUG: Set noSchoolDetails to '\(noSchoolDetails ?? "nil")'")
        }
    }

    // MARK: - Refresh and Staleness Functions
    
    @MainActor
    func refreshSchedule() async {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = Date.estTimeZone
        let dateString = formatter.string(from: currentTime)
        
        // print("🔄 [SCHEDULE] Starting refreshSchedule for date: \(dateString)")
        
        // 刷新时重新拉取并缓存 special_days / special_periods、day type 与默认课表，供 Widget 用缓存展示
        await CloudflareDataLoader.refreshSpecialDataCache()
        await DayTypeCache.refreshDayTypeCache()
        ScheduleCacheForWidget.cacheDefaultSchedulesToAppGroup()
        
        var firebaseSucceeded = false
        
        do {
            // print("🔍 [SCHEDULE] Step 1: Checking if in special period...")
            // 1. Check if in break
            if try await ScheduleTypeFetcher.isInSpecialPeriod(date: currentTime) {
                // print("✅ [SCHEDULE] In special period (break) - setting no school")
                noSchool = true
                loader.blocks = []
                
                // 获取 special period 的详细信息
                if let periodDetails = try await ScheduleTypeFetcher.getSpecialPeriodDetails(date: currentTime), !periodDetails.isEmpty {
                    scheduleTitle = periodDetails
                    noSchoolDetails = periodDetails
                    showDetailsText = true  // 确保 details 文本显示
                    // print("✅ [SCHEDULE] Special period details: '\(periodDetails)'")
                } else {
                    scheduleTitle = "No School (Break)"
                    noSchoolDetails = "Break"
                    showDetailsText = true  // 确保 details 文本显示
                    // print("⚠️ [SCHEDULE] No special period details found, using default")
                }
                firebaseSucceeded = true
            }
            // 2. Try to find special_day and get type with details
            else {
                // print("🔍 [SCHEDULE] Step 2: Checking for special day info...")
                if let specialDayInfo = try await ScheduleTypeFetcher.fetchSpecialDayInfo(date: currentTime) {
                    // print("✅ [SCHEDULE] Found special day: type='\(specialDayInfo.type)', details='\(specialDayInfo.details ?? "nil")'")
                    
                    if specialDayInfo.type == "no_school" {
                        // print("📅 [SCHEDULE] Special day is no_school")
                        noSchool = true
                        noSchoolDetails = specialDayInfo.details
                        showDetailsText = true  // 确保 details 文本显示
                        loader.blocks = []
                        scheduleTitle = "No School"
                        firebaseSucceeded = true
                    } else if specialDayInfo.type == "custom" {
                        // print("🔍 [SCHEDULE] Special day is custom - loading custom schedule...")
                        // 3. If type is custom, read the custom schedule
                        if let blocks = try await ScheduleTypeFetcher.loadCustomSchedule(for: currentTime) {
                            // print("✅ [SCHEDULE] Loaded custom schedule with \(blocks.count) blocks")
                            loader.blocks = blocks
                            noSchool = false
                            scheduleTitle = "Custom Schedule"
                            firebaseSucceeded = true
                        } else {
                            // print("❌ [SCHEDULE] Custom schedule returned no blocks")
                        }
                    } else {
                        // print("📄 [SCHEDULE] Special day type '\(specialDayInfo.type)' - loading from JSON...")
                        // try to load (type).json
                        loader.loadSchedule(from: specialDayInfo.type)
                        if !loader.blocks.isEmpty {
                            // print("✅ [SCHEDULE] Loaded \(loader.blocks.count) blocks from \(specialDayInfo.type).json")
                            noSchool = false
                            noSchoolDetails = nil // Clear details for non-no-school days
                            scheduleTitle = specialDayInfo.type.capitalized.replacingOccurrences(of: "_", with: " ")
                            firebaseSucceeded = true
                        } else {
                            // print("❌ [SCHEDULE] No blocks found in \(specialDayInfo.type).json")
                        }
                    }
                } else {
                    // print("❌ [SCHEDULE] No special day info found in Firebase")
                }
            }
            
            // If Firebase calls succeeded, clear stale flag
            if firebaseSucceeded {
                // print("✅ [SCHEDULE] Firebase succeeded - clearing stale flag")
                isStale = false
            } else {
                // print("⚠️ [SCHEDULE] Firebase responded but no data found - falling back to weekday schedule")
                // Firebase responded but no data found, fall back to local
                loadWeekdaySchedule()
                scheduleTitle = getWeekdayTitle()
                // Don't clear noSchoolDetails here - loadWeekdaySchedule() sets it correctly for weekends
            }
            
        } catch {
            // print("❌ [SCHEDULE] Firebase calls failed: \(error)")
            // print("⚠️ [SCHEDULE] Falling back to weekday schedule")
            // Firebase calls failed (network issue, blocked, etc.)
            loadWeekdaySchedule() // Fallback to local data
            scheduleTitle = getWeekdayTitle()
            // Don't clear noSchoolDetails here - loadWeekdaySchedule() sets it correctly for weekends
            // Keep isStale = true since Firebase failed
        }
        
        // print("📋 [SCHEDULE] Final result: title='\(scheduleTitle)', noSchool=\(noSchool), blocks=\(loader.blocks.count), isStale=\(isStale)")
        
        updateCountdownWidget()

        // Signal that loading is complete
        onLoadingComplete()
        // print("✅ [SCHEDULE] Loading complete!")
    }



    private func updateCountdownWidget() {
        guard testDate == nil else { return }

        let scheduleDate = Calendar.sja.startOfDay(for: Date.currentEST)

        if noSchool {
            let reason = (noSchoolDetails?.isEmpty == false ? noSchoolDetails! : "No School")
            WidgetSyncManager.shared.clearSchedule(reason: reason)
            return
        }

        let events: [WidgetClassEvent] = displayBlocks.compactMap { block in
            guard let start = timeToday(block.start), let end = timeToday(block.end) else { return nil }
            let displayName = getBlockDisplayName(for: block)
            return WidgetClassEvent(blockName: block.name, displayName: displayName, startDate: start, endDate: end)
        }

        if events.isEmpty {
            if scheduleTitle == "Loading..." {
                return
            }
            let reason = (noSchoolDetails?.isEmpty == false ? noSchoolDetails! : "Schedule unavailable")
            WidgetSyncManager.shared.clearSchedule(reason: reason)
        } else {
            let displayDayType = resolveDayTypeDisplay(for: scheduleDate)
            let titleForWidget: String? = {
                guard scheduleTitle != "Loading..." else { return nil }
                return scheduleTitle != getWeekdayTitle() ? scheduleTitle : nil
            }()
            WidgetSyncManager.shared.updateSchedule(
                scheduleDate: scheduleDate,
                events: events,
                noSchoolReason: nil,
                dayTypeDisplay: displayDayType,
                scheduleTitle: titleForWidget
            )
        }
    }

    private func resolveDayTypeDisplay(for scheduleDate: Date) -> String? {
        let calendar = Calendar.sja

        func sanitized(_ value: String) -> String? {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            let lower = trimmed.lowercased()
            guard !trimmed.isEmpty,
                  lower != "loading...",
                  lower != "unknown",
                  lower != "please refresh" else {
                return nil
            }
            return trimmed
        }

        if let typeDate = currentDayTypeDate,
           calendar.isDate(typeDate, inSameDayAs: scheduleDate),
           let sanitizedCurrent = sanitized(currentDayType) {
            return sanitizedCurrent
        }

        if let cached = DayTypeCache.cachedEffectiveDayType(),
           calendar.isDate(cached.date, inSameDayAs: scheduleDate),
           let sanitizedCached = sanitized(cached.type) {
            return sanitizedCached
        }

        if let predicted = DayTypeCache.cachedPredictedDayType(),
           calendar.isDate(predicted.date, inSameDayAs: scheduleDate),
           let sanitizedPredicted = sanitized(predicted.type) {
            return sanitizedPredicted
        }

        if let bulletin = DayTypeCache.cachedBulletinDayType(),
           calendar.isDate(bulletin.date, inSameDayAs: scheduleDate),
           let sanitizedBulletin = sanitized(bulletin.type) {
            return sanitizedBulletin
        }

        return nil
    }


    func getWeekdayTitle() -> String {
        let weekday = Calendar.current.component(.weekday, from: currentTime)
        switch weekday {
        case 2: return "Monday"
        case 3: return "Tuesday" 
        case 4: return "Wednesday"
        case 5: return "Thursday"
        case 6: return "Friday"
        default: return "Weekday Schedule"
        }
    }
    
    // MARK: - Time Update Timer Functions
    
    func startTimeUpdateTimer() {
        // Stop any existing timer
        stopTimeUpdateTimer()
        
        // Create a timer that updates every second, but only update if there are active timers to show
        timeUpdateTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            // Only update time if we have blocks loaded and need to show countdowns
            if !loader.blocks.isEmpty {
                now = Date.currentEST
            }
        }
    }
    
    func stopTimeUpdateTimer() {
        timeUpdateTimer?.invalidate()
        timeUpdateTimer = nil
    }
    
    // MARK: - Text Animation Functions
    
    func startTextAnimation() {
        // Show "No School" text immediately with smooth animation
        // print("🔍 DEBUG: startTextAnimation called")
        // print("🔍 DEBUG: noSchoolDetails = '\(noSchoolDetails ?? "nil")'")
        showNoSchoolText = true
        
        // Show details text if available (will be set by refreshSchedule if needed)
        if let details = noSchoolDetails, !details.isEmpty {
            // print("🔍 DEBUG: Setting showDetailsText = true for details: '\(details)'")
            showDetailsText = true
        } else {
            // print("🔍 DEBUG: noSchoolDetails is nil or empty, not showing details")
        }
    }
    
    // MARK: - Simple Confetti Setup
    
    func checkConfettiAndStartText() {
        // print("🎊 Setting up confetti for no school day")
        // print("🎊 Always showing confetti on no school days!")
        shouldShowConfetti = true
          }
    
    // MARK: - Block Display Logic
    
    private func getBlockDisplayName(for block: Block) -> String {
        let scheduleDate = Calendar.sja.startOfDay(for: currentTime)
        let normalizedDayType = dayTypeForBlockFiltering(on: scheduleDate)
        let lowercasedCurrent = currentDayType.lowercased()
        let isExplicitUnknown = lowercasedCurrent.contains("unknown")
        let isGreenDay = normalizedDayType == "Green Day"
        let isUnknownDay = normalizedDayType == nil || isExplicitUnknown

        // If day type is unknown and block has only one day enabled, show the original block name (will be styled in red)
        if isUnknownDay && hasOnlyOneDay(for: block.name) {
            return block.name
        }

        // Check if this block should be shown on the current day type (defaults to white-day settings when unknown)
        let shouldTreatAsGreen = isGreenDay
        if blockManager.shouldShow(block: block.name, onGreenDay: shouldTreatAsGreen) {
            // Show custom name or original name, passing the current day type
            return blockManager.getDisplayName(for: block.name, isGreenDay: shouldTreatAsGreen)
        } else {
            // Show as "Free Block" when the day type checkbox is NOT checked
            return "Free Block"
        }
    }

    private func dayTypeForBlockFiltering(on scheduleDate: Date) -> String? {
        if let resolved = resolveDayTypeDisplay(for: scheduleDate) {
            return resolved
        }

        let trimmed = currentDayType.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = trimmed.lowercased()
        if lower.contains("green day") && !lower.contains("white") {
            return "Green Day"
        }
        if lower.contains("white day") && !lower.contains("green") {
            return "White Day"
        }
        return nil
    }
    
    private func hasOnlyOneDay(for blockName: String) -> Bool {
        let settings: BlockSettings
        switch blockName {
        case "A Block": settings = blockManager.blockA
        case "B Block": settings = blockManager.blockB
        case "C Block": settings = blockManager.blockC
        case "D Block": settings = blockManager.blockD
        case "E Block": settings = blockManager.blockE
        default: return false
        }
        
        // Return true if exactly one day is enabled (not both, not neither)
        return settings.showOnGreenDay != settings.showOnWhiteDay
    }
    
    private func shouldUseGrayColor(for block: Block) -> Bool {
        let displayName = getBlockDisplayName(for: block)
        // Use gray color for "Free Block" or non-regular class blocks (like chapel, CP)
        return displayName == "Free Block" || !isRegularClassBlock(block.name)
    }
    
    private func shouldUseRedColor(for block: Block) -> Bool {
        let isUnknownDay = currentDayType.lowercased().contains("unknown")
        return isUnknownDay && hasOnlyOneDay(for: block.name)
    }
    
    private func getBlockTextColor(for block: Block) -> Color {
        if shouldUseRedColor(for: block) {
            return .red
        } else if shouldUseGrayColor(for: block) {
            return .secondary
        } else {
            return .primary
        }
    }
  }

// MARK: - Grade Prompt Sheet

/// First-launch grade picker shown when today's schedule has grade-specific blocks
/// and the user has not yet set their `graduationYear`. Mirrors the Chrome extension's
/// design: capsule-shaped options in a 2-column grid, a hint, and a full-width
/// "Continue" button that fades in once a grade is selected.
struct GradePromptSheet: View {
    let onSelect: (GradeLevel) -> Void
    @State private var pending: GradeLevel? = nil

    // Match chrome-extension/src/popup/popup.css colors so the iOS sheet feels
    // identical to the extension's prompt.
    private let optionBg     = Color(red: 0xeb / 255, green: 0xee / 255, blue: 0xf2 / 255) // #ebeef2
    private let selectedBg   = Color(red: 0xab / 255, green: 0xe0 / 255, blue: 0xbc / 255) // #abe0bc
    private let selectedText = Color(red: 0x14 / 255, green: 0x53 / 255, blue: 0x2d / 255) // #14532d

    var body: some View {
        VStack(spacing: 16) {
            Text("Which grade are you in?")
                .font(.title3.weight(.semibold))
                .padding(.top, 24)

            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)],
                spacing: 8
            ) {
                ForEach(GradeLevel.allCases) { grade in
                    Button {
                        withAnimation(.easeInOut(duration: 0.18)) {
                            pending = (pending == grade) ? nil : grade
                        }
                    } label: {
                        Text(grade.label)
                            .font(.callout.weight(pending == grade ? .semibold : .regular))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 10)
                            .background(
                                Capsule().fill(pending == grade ? selectedBg : optionBg)
                            )
                            .foregroundColor(pending == grade ? selectedText : .primary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)

            Text("You can change this anytime in Settings.")
                .font(.footnote)
                .foregroundColor(.secondary)

            Spacer(minLength: 0)

            Button {
                if let g = pending { onSelect(g) }
            } label: {
                HStack(spacing: 6) {
                    Text("Continue")
                        .font(.callout.weight(.semibold))
                    Image(systemName: "arrow.right")
                        .font(.callout.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Capsule().fill(selectedBg))
                .foregroundColor(selectedText)
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
            .opacity(pending == nil ? 0 : 1)
            .allowsHitTesting(pending != nil)
            .offset(y: pending == nil ? 6 : 0)
            .animation(.easeOut(duration: 0.2), value: pending)
        }
    }
}

#Preview {
    ScheduleView(testDate: nil, noSchool: .constant(false), isStale: .constant(true), loader: ScheduleLoader(), onLoadingComplete: {}, onPullRefresh: {}, showSplashScreen: .constant(false), disablePullToRefreshGesture: .constant(false), currentDayType: "Green Day", currentDayTypeDate: nil)
}
