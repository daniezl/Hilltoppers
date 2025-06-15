//
//  SplashScreenView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI

struct ConcaveBottomShape: Shape {
    let curveOffset: CGFloat // How far below screen the curve starts
    
    func path(in rect: CGRect) -> Path {
        var path = Path()
        
        // Start from top-left
        path.move(to: CGPoint(x: 0, y: 0))
        
        // Top edge
        path.addLine(to: CGPoint(x: rect.width, y: 0))
        
        // Right edge - always extend to show the curve area
        path.addLine(to: CGPoint(x: rect.width, y: rect.height + 200))
        
        // Concave down curve at bottom (n-shaped) - always present, positioned by offset
        path.addQuadCurve(
            to: CGPoint(x: 0, y: rect.height + 200),
            control: CGPoint(x: rect.width / 2, y: rect.height + 200 - 80 + curveOffset)
        )
        
        // Left edge back to start
        path.addLine(to: CGPoint(x: 0, y: 0))
        
        return path
    }
}

struct SplashScreenView: View {
    @State private var iconOffset: CGFloat = 1000
    @State private var viewOffset: CGFloat = 0
    @State private var showIcon = false
    @State private var screenHeight: CGFloat = 0
    @State private var shouldSlideOut = false
    @State private var curveOffset: CGFloat = 0 // Curve position relative to screen
    @Binding var isLoading: Bool
    let onAnimationComplete: () -> Void
    
    private let darkGreen = Color(red: 4/255, green: 54/255, blue: 21/255) // #043615
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Dark green background with concave bottom curve
                ConcaveBottomShape(curveOffset: curveOffset)
                    .fill(darkGreen)
                    .ignoresSafeArea()
                
                // School logo icon
                Image("school-icon")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 240, height: 240) // size of icon
                    .colorMultiply(.white)
                    .offset(y: iconOffset - 35)
                    .opacity(showIcon ? 1 : 0)
            }
            .offset(y: viewOffset)
            .onAppear {
                screenHeight = geometry.size.height
                iconOffset = screenHeight
                curveOffset = 80 // Start with curve pushed down (flattened)
                startAnimation()
            }
            .onChange(of: isLoading) { newValue in
                if !newValue && !shouldSlideOut {
                    shouldSlideOut = true
                    // Loading is complete, slide out with synchronized animation
                    
                    // Single animation for both movement and curve - perfectly synchronized
                    withAnimation(.easeIn(duration: 0.8)) {
                        viewOffset = -(screenHeight + 300) // Go much further off-screen
                        curveOffset = -80 // Curve becomes more pronounced
                    }
                    
                    // Call completion after animation is completely done
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                        onAnimationComplete()
                    }
                }
            }
        }
    }
    
    private func startAnimation() {
        // Show the icon and start the fly-in animation
        showIcon = true
        
        // Fly in from bottom with subtle bounce
        withAnimation(.interpolatingSpring(stiffness: 140, damping: 16)) {
            iconOffset = 0
        }
    }
}

struct SplashScreenView_Previews: PreviewProvider {
    static var previews: some View {
        SplashScreenView(isLoading: .constant(true), onAnimationComplete: {})
    }
} 
