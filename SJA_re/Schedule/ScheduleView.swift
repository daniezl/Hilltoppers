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
        print("LottieView makeUIView called for: \(animationName)")
        let view = UIView(frame: .zero)
        
        let animationView = LottieAnimationView()
        print("Loading Lottie animation: \(animationName)")
        animationView.animation = LottieAnimation.named(animationName)
        
        if animationView.animation == nil {
            print("ERROR: Could not load Lottie animation named '\(animationName)'")
        } else {
            print("Lottie animation loaded successfully")
        }
        
        animationView.contentMode = .scaleAspectFit
        animationView.loopMode = loopMode
        
        print("Starting Lottie animation playback")
        animationView.play { finished in
            print("Lottie animation playback completed: \(finished)")
            completion?()
        }
        
        view.addSubview(animationView)
        animationView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            animationView.heightAnchor.constraint(equalTo: view.heightAnchor),
            animationView.widthAnchor.constraint(equalTo: view.widthAnchor)
        ])
        
        return view
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
        // Update logic if needed
    }
}

// MARK: - Confetti Animation View
struct ConfettiAnimationView: View {
    @Binding var showSplashScreen: Bool
    let onAnimationComplete: () -> Void
    @State private var shouldStartAnimation = false
    @State private var animationFinished = false
    
    var body: some View {
        ZStack {
            if shouldStartAnimation && !animationFinished {
                LottieView(animationName: "confetti", loopMode: .playOnce) {
                    print("Confetti animation completed!")
                    animationFinished = true
                    onAnimationComplete()
                }
                .offset(y: -200) // Move confetti up 
            }
        }
        .onAppear {
            print("ConfettiAnimationView appeared, showSplashScreen: \(showSplashScreen)")
            if !showSplashScreen {
                print("Splash screen already ended, starting confetti animation")
                startAnimation()
            } else {
                // Start animation early so it's visually playing by the time splash screen ends
                print("Starting confetti early to compensate for Lottie visual delay")
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.78) {
                    if shouldStartAnimation == false { // Only start if not already started
                        print("Early confetti start triggered")
                        startAnimation()
                    }
                }
            }
        }
        .onChange(of: showSplashScreen) { newValue in
            print("Splash screen state changed to: \(newValue)")
            if !newValue && !shouldStartAnimation {
                print("Splash screen ended, starting confetti animation")
                startAnimation()
            }
        }
    }
    
    private func startAnimation() {
        print("startAnimation() called - starting confetti immediately to compensate for Lottie delay")
        // Start immediately - no DispatchQueue to compensate for Lottie loading time
        shouldStartAnimation = true
        print("Confetti animation starting now!")
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
    @State private var expandedBlockID: UUID?
    @State private var now = Date()
    @State private var scheduleTitle: String = "Loading..."
    @State private var timeUpdateTimer: Timer?
    @State private var noSchoolDetails: String? = nil
    @State private var disablePullToRefresh = false
    @State private var showNoSchoolText = false
    @State private var showDetailsText = false
    @State private var balloonHasExited = false
    @State private var hasStartedTextAnimation = false
    @State private var shouldShowConfetti = false

    


    // Use this everywhere instead of 'now'
    var currentTime: Date {
        testDate ?? now
    }
    
    // Always show all blocks, control visibility with opacity/transform
    var displayBlocks: [Block] {
        loader.blocks
    }

    var body: some View {
        VStack(spacing: 0) {
            if noSchool {
                ZStack {
                    VStack {
                        VStack(alignment: balloonHasExited ? .center : .leading, spacing: 8) {
                            Text("No School")
                                .font(balloonHasExited ? .system(size: 48, weight: .bold) : .largeTitle)
                                .fontWeight(.bold)
                                .foregroundColor(.primary)
                                .opacity(showNoSchoolText ? 1 : 0)
                                .scaleEffect(showNoSchoolText ? 1 : 0.8)
                                .animation(.spring(response: 0.6, dampingFraction: 0.7), value: showNoSchoolText)
                                .animation(.spring(response: 0.8, dampingFraction: 0.7), value: balloonHasExited)
                            
                            if let details = noSchoolDetails, !details.isEmpty {
                                Text(details)
                                    .font(balloonHasExited ? .system(size: 32, weight: .medium) : .title2)
                                    .foregroundColor(.secondary)
                                    .opacity(showDetailsText ? 1 : 0)
                                    .scaleEffect(showDetailsText ? 1 : 0.8)
                                    .animation(.spring(response: 0.6, dampingFraction: 0.7).delay(0.3), value: showDetailsText)
                                    .animation(.spring(response: 0.8, dampingFraction: 0.7), value: balloonHasExited)
                                    .onAppear {
                                        print("DEBUG: Displaying no school details: '\(details)'")
                                    }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: balloonHasExited ? .center : .leading)
                        .padding(.horizontal, balloonHasExited ? 20 : 40)
                        .padding(.top, balloonHasExited ? 200 : 160)
                        .animation(.spring(response: 0.8, dampingFraction: 0.7), value: balloonHasExited)
                        Spacer()
                    }
                    
                    // Confetti Animation (only once per day)
                    if shouldShowConfetti {
                        ConfettiAnimationView(showSplashScreen: $showSplashScreen) {
                            // Confetti has completed - make text bigger
                            balloonHasExited = true
                        }
                    }
                }
                .onAppear {
                    if noSchool && !hasStartedTextAnimation {
                        hasStartedTextAnimation = true
                        startTextAnimation()
                    }
                    
                    // Check if we should show confetti today (independent of text animation)
                    if noSchool && shouldShowConfettiToday() {
                        shouldShowConfetti = true
                        markConfettiShownToday()
                    }
                }
                .onChange(of: noSchool) { _ in
                    if noSchool && !hasStartedTextAnimation {
                        hasStartedTextAnimation = true
                        startTextAnimation()
                    }
                    
                    // Check if we should show confetti today (independent of text animation)
                    if noSchool && shouldShowConfettiToday() {
                        shouldShowConfetti = true
                        markConfettiShownToday()
                    }
                }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Schedule card
                        VStack(spacing: 0) {
                            // Schedule title inside card
                            HStack {
                                Text(scheduleTitle.lowercased() == "abdec" ? scheduleTitle.uppercased() : scheduleTitle)
                                    .font(.headline)
                                    .fontWeight(.bold)
                                Spacer()
                            }
                            .padding(.horizontal, 16)
                            .padding(.top, 16)
                            .padding(.bottom, 8)
                            
                            Divider()
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8) // between title and blocks
                            
                            ForEach(Array(loader.blocks.enumerated()), id: \.element.id) { index, block in
                                let _ = print("Animation order - Index \(index): \(block.name)")
                                VStack(spacing: 0) {
                                    // Time info above highlighted block (only if dropdown is closed)
                                    if expandedBlockID != block.id {
                                        if isCurrent(block: block) {
                                            if let (currentBlock, secondsLeft) = currentBlockInfo() {
                                                HStack {
                                                    Spacer()
                                                    Text("Ends in \(formatTime(secondsLeft))")
                                                        .font(.caption)
                                                        .foregroundColor(.green)
                                                }
                                                .padding(.horizontal, 32) // align with highlight edge
                                                .padding(.bottom, 4)
                                            }
                                        } else if isNextUpcomingBlock(block) {
                                            if let (nextBlock, seconds) = nextBlockInfo() {
                                                HStack {
                                                    Spacer()
                                                    Text("Starts in \(formatTime(seconds))")
                                                        .font(.caption)
                                                        .foregroundColor(.blue)
                                                }
                                                .padding(.horizontal, 32) // align with dashed line edge
                                                .padding(.bottom, 4)
                                            }
                                        }
                                    }
                                    
                                    // Main block row
                                    HStack {
                                        Text(block.name)
                                            .font((isCurrent(block: block) || isNextUpcomingBlock(block)) ? .title2.weight(.bold) : .callout.weight(.medium))
                                            .foregroundColor(loader.showBlocks ? (isRegularClassBlock(block.name) ? .primary : .secondary) : .primary)
                                        Spacer()
                                        Text("\(block.start)-\(block.end)")
                                            .font(.callout.weight(.regular))
                                            .monospacedDigit()
                                            .foregroundColor(loader.showBlocks ? (isRegularClassBlock(block.name) ? .primary : .secondary) : .primary)
                                        
                                        // Consistent chevron space for alignment
                                        if block.subBlocks != nil {
                                            Image(systemName: expandedBlockID == block.id ? "chevron.down" : "chevron.right")
                                                .font(.system(size: 12, weight: .semibold))
                                        } else {
                                            Image(systemName: "chevron.right")
                                                .font(.system(size: 12, weight: .semibold))
                                                .opacity(0) // invisible but takes up space
                                        }
                                    }
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 8) // between blocks
                                    .background(
                                        RoundedRectangle(cornerRadius: 8)
                                            .fill(isCurrent(block: block) ? Color.green.opacity(0.15) : Color.clear)
                                            .padding(.horizontal, 8) // gap from card edges
                                    )
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 8)
                                            .stroke(style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                                            .foregroundColor(isNextUpcomingBlock(block) ? Color.green : Color.clear)
                                            .padding(.horizontal, 8) // gap from card edges
                                    )
                                    .onTapGesture {
                                        if block.subBlocks != nil {
                                            withAnimation(.easeInOut(duration: 0.3)) {
                                                expandedBlockID = expandedBlockID == block.id ? nil : block.id
                                            }
                                        }
                                    }
                                    
                                    // Matching bottom padding for current blocks (to balance the timer above)
                                    if isCurrent(block: block) && expandedBlockID != block.id {
                                        Color.clear
                                            .frame(height: 8) // matches timer text height + padding
                                    }
                                    
                                    // SubBlocks dropdown
                                    if expandedBlockID == block.id, let subBlocks = block.subBlocks {
                                        VStack(spacing: 0) {
                                            ForEach(subBlocks) { sub in
                                                VStack(spacing: 0) {
                                                    // Time info above current subblock
                                                    if isCurrent(subBlock: sub) {
                                                        if let end = timeToday(sub.end) {
                                                            let secondsLeft = Int(end.timeIntervalSince(currentTime))
                                                            HStack {
                                                                Spacer()
                                                                Text("Ends in \(formatTime(secondsLeft))")
                                                                    .font(.caption)
                                                                    .foregroundColor(.green)
                                                            }
                                                            .padding(.leading, 32) // align with subblock content
                                                            .padding(.trailing, 34) // align with subblock times
                                                            .padding(.bottom, 4)
                                                        }
                                                    }
                                                    
                                                    // Subblock row
                                                HStack {
                                                    Text(sub.name)
                                                        .font(.caption)
                                                        .foregroundColor(.secondary)
                                                    Spacer()
                                                    Text("\(sub.start)-\(sub.end)")
                                                        .font(.caption)
                                                        .monospacedDigit()
                                                        .foregroundColor(.secondary)
                                                    
                                                    // Invisible chevron for alignment
                                                    Image(systemName: "chevron.right")
                                                        .font(.system(size: 12, weight: .semibold))
                                                        .opacity(0)
                                                }
                                                .padding(.leading, 32) // indent from left
                                                .padding(.trailing, 16) // same as main blocks
                                                .padding(.vertical, 6)
                                                .background(
                                                    RoundedRectangle(cornerRadius: 6)
                                                        .fill(isCurrent(subBlock: sub) ? Color.green.opacity(0.1) : Color.clear)
                                                        .padding(.horizontal, 8)
                                                )
                                                }
                                            }
                                        }
                                        .background(Color.gray.opacity(0.05))
                                        .cornerRadius(8)
                                        .padding(.horizontal, 8)
                                        .transition(.opacity.combined(with: .move(edge: .top)))
                                    }
                                }
                                .opacity(loader.showBlocks ? 1 : 0)
                                .offset(x: loader.showBlocks ? 0 : -30)
                                .animation(.easeOut(duration: 0.2).delay(Double(index) * 0.04), value: loader.showBlocks)
                            }
                        }
                        .background(Color(red: 245/255, green: 246/255, blue: 245/255))
                        .cornerRadius(12)
                    }
                    .padding(.leading, 50) // more space on left
                    .padding(.trailing, 30) // less space on right
                    .padding(.top, 8)
                }
            }
        }
        .onAppear {
            loader.showBlocks = false
            startTimeUpdateTimer()
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
    }

    // Helper functions
    func isCurrent(block: Block) -> Bool {
        guard let start = timeToday(block.start), let end = timeToday(block.end) else { return false }
        return currentTime >= start && currentTime < end
    }

    func currentBlockInfo() -> (Block, Int)? {
        for block in loader.blocks {
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
        if loader.blocks.isEmpty { return nil }
        if loader.blocks.contains(where: isCurrent) { return nil }
        let futureBlocks = loader.blocks.compactMap { block -> (Block, Int)? in
            guard let start = timeToday(block.start) else { return nil }
            let diff = Int(start.timeIntervalSince(currentTime))
            return diff > 0 ? (block, diff) : nil
        }
        return futureBlocks.min(by: { $0.1 < $1.1 })
    }

    func timeToday(_ time: String) -> Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        let calendar = Calendar.current
        guard let t = formatter.date(from: time) else { return nil }
        let comps = calendar.dateComponents([.year, .month, .day], from: currentTime)
        return calendar.date(bySettingHour: calendar.component(.hour, from: t), minute: calendar.component(.minute, from: t), second: 0, of: calendar.date(from: comps)!)
    }

    func isNextBlock(index: Int) -> Bool {
        guard !isCurrent(block: loader.blocks[index]) else { return false }
        let block = loader.blocks[index]
        let start = timeToday(block.start) ?? Date.distantFuture
        if index == 0 {
            // Before the first block
            return currentTime < start
        } else {
            let prevEnd = timeToday(loader.blocks[index - 1].end) ?? Date.distantPast
            return currentTime >= prevEnd && currentTime < start
        }
    }
    
    func isNextUpcomingBlock(_ block: Block) -> Bool {
        // Don't show dashed border if currently in a block
        if loader.blocks.contains(where: { isCurrent(block: $0) }) {
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
        for block in loader.blocks {
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
        let weekday = Calendar.current.component(.weekday, from: currentTime)
        // print("Weekday: \(weekday)")
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
            loader.loadSchedule(from: file)
            noSchool = false
            noSchoolDetails = nil
        } else {
            loader.blocks = []
            noSchool = true
            noSchoolDetails = nil // Weekend has no special details
        }
    }

    // MARK: - Refresh and Staleness Functions
    
    @MainActor
    func refreshSchedule() async {
        
        var firebaseSucceeded = false
        
        do {
            // 1. Check if in break
            if try await ScheduleTypeFetcher.isInSpecialPeriod(date: currentTime) {
                noSchool = true
                loader.blocks = []
                // print("In break")
                firebaseSucceeded = true
            }
            // 2. Try to find special_day and get type with details
            else if let specialDayInfo = try await ScheduleTypeFetcher.fetchSpecialDayInfo(date: currentTime) {
                if specialDayInfo.type == "no_school" {
                    noSchool = true
                    noSchoolDetails = specialDayInfo.details
                    loader.blocks = []
                    print("DEBUG: Setting no school with details: '\(specialDayInfo.details ?? "nil")'")
                    firebaseSucceeded = true
                } else if specialDayInfo.type == "custom" {
                    // 3. If type is custom, read the custom schedule
                    if let blocks = try await ScheduleTypeFetcher.loadCustomSchedule(for: currentTime) {
                        loader.blocks = blocks
                        noSchool = false
                        // print("Custom schedule")
                        scheduleTitle = "Custom Schedule"
                        firebaseSucceeded = true
                    }
                } else {
                    // try to load (type).json
                    loader.loadSchedule(from: specialDayInfo.type)
                    if !loader.blocks.isEmpty {
                        noSchool = false
                        noSchoolDetails = nil // Clear details for non-no-school days
                        // print("Schedule from \(specialDayInfo.type).json")
                        scheduleTitle = specialDayInfo.type.capitalized.replacingOccurrences(of: "_", with: " ")
                        firebaseSucceeded = true
                    }
                }
            }
            
            // If Firebase calls succeeded, clear stale flag
            if firebaseSucceeded {
                isStale = false
            } else {
                // Firebase responded but no data found, fall back to local
                // print("No Firebase data found, using local schedule")
                loadWeekdaySchedule()
                scheduleTitle = getWeekdayTitle()
                noSchoolDetails = nil // Clear details for weekday schedules
            }
            
        } catch {
            // Firebase calls failed (network issue, blocked, etc.)
            // print("Error refreshing schedule (Firebase failed): \(error)")
            loadWeekdaySchedule() // Fallback to local data
            scheduleTitle = getWeekdayTitle()
            noSchoolDetails = nil // Clear details for weekday schedules
            // Keep isStale = true since Firebase failed
        }
        
        // Signal that loading is complete
        onLoadingComplete()
    }
    


    func getWeekdayTitle() -> String {
        let weekday = Calendar.current.component(.weekday, from: currentTime)
        switch weekday {
        case 2: return "Monday Schedule"
        case 3: return "Tuesday Schedule" 
        case 4: return "Wednesday Schedule"
        case 5: return "Thursday Schedule"
        case 6: return "Friday Schedule"
        default: return "Weekday Schedule"
        }
    }
    
    // MARK: - Time Update Timer Functions
    
    func startTimeUpdateTimer() {
        // Stop any existing timer
        stopTimeUpdateTimer()
        
        // Create a timer that updates every second
        timeUpdateTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            now = Date()
        }
    }
    
    func stopTimeUpdateTimer() {
        timeUpdateTimer?.invalidate()
        timeUpdateTimer = nil
    }
    
    // MARK: - Text Animation Functions
    
    func startTextAnimation() {
        // Show "No School" text immediately with smooth animation
        showNoSchoolText = true
        
        // Show details text after a short delay if available
        if noSchoolDetails != nil {
            showDetailsText = true
        }
    }
    
    // MARK: - Confetti Management Functions
    
    func shouldShowConfettiToday() -> Bool {
        // TESTING: Always show confetti for testing purposes
        return true
        
        // PRODUCTION: Uncomment below and comment out "return true" above
        // let today = dateKey(for: currentTime)
        // let lastShownKey = "confetti_last_shown"
        // let lastShown = UserDefaults.standard.string(forKey: lastShownKey)
        // return lastShown != today
    }
    
    func markConfettiShownToday() {
        let today = dateKey(for: currentTime)
        let lastShownKey = "confetti_last_shown"
        UserDefaults.standard.set(today, forKey: lastShownKey)
    }
    
    func dateKey(for date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

struct BlockHeader: View {
    let block: Block
    let isCurrent: Bool
    let isNext: Bool
    let expanded: Bool
    let onTap: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(block.name)
                    .font(.headline)
                    .foregroundColor(isCurrent ? .green : (isNext ? .green : .primary))
                Text("\(block.start) - \(block.end)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            Spacer()
            if block.subBlocks != nil {
                Button(action: onTap) {
                    Image(systemName: expanded ? "chevron.down" : "chevron.right")
                        .foregroundColor(.gray)
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
        .padding(.vertical, 0)
        .background(isCurrent ? Color.green.opacity(0.2) : Color.clear)
        .overlay(
            isNext ?
                RoundedRectangle(cornerRadius: 8)
                    .stroke(style: StrokeStyle(lineWidth: 3, dash: [6]))
                    .foregroundColor(Color.green.opacity(0.7))
                : nil
        )
        .cornerRadius(8)
    }
}

#Preview {
    ScheduleView(testDate: nil, noSchool: .constant(false), isStale: .constant(true), loader: ScheduleLoader(), onLoadingComplete: {}, onPullRefresh: {}, showSplashScreen: .constant(false), disablePullToRefreshGesture: .constant(false))
}

