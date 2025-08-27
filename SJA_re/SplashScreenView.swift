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
        
        // Start from top-left, slightly extended beyond left edge to avoid artifacts
        path.move(to: CGPoint(x: -1, y: 0))
        
        // Top edge, slightly extended beyond right edge
        path.addLine(to: CGPoint(x: rect.width + 1, y: 0))
        
        // Right edge - extend further down to make rectangle taller
        path.addLine(to: CGPoint(x: rect.width + 1, y: rect.height + 400))
        
        // Concave down curve at bottom (n-shaped) - positioned lower for taller rectangle
        path.addQuadCurve(
            to: CGPoint(x: -1, y: rect.height + 400),
            control: CGPoint(x: rect.width / 2, y: rect.height + 400 - 80 + curveOffset)
        )
        
        // Left edge back to start, slightly extended beyond left edge
        path.addLine(to: CGPoint(x: -1, y: 0))
        
        path.closeSubpath() // Explicitly close the path
        
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
                    .drawingGroup() // Optimize complex shape rendering
                
                // School logo icon
                Image("school-icon")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 240, height: 240)
                    .colorMultiply(.white)
                    .offset(y: iconOffset - 35)
                    .opacity(showIcon ? 1 : 0)
                    .drawingGroup() // Optimize icon rendering
            }
            .offset(y: viewOffset)
            .onAppear {
                screenHeight = geometry.size.height
                iconOffset = screenHeight
                curveOffset = 80
                
                // Delay start slightly to avoid frame drop on launch
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    startAnimation()
                }
            }
            .onChange(of: isLoading) { newValue in
                if !newValue && !shouldSlideOut {
                    shouldSlideOut = true
                    
                    // Smooth exit animation with better timing
                    withAnimation(.easeInOut(duration: 0.6)) {
                        viewOffset = -(screenHeight + 400)
                        curveOffset = -60
                    }
                    
                    // Shorter delay for completion
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
                        onAnimationComplete()
                    }
                }
            }
        }
        .compositingGroup() // Optimize entire splash as single layer
    }
    
    private func startAnimation() {
        // Show the icon and start the fly-in animation
        showIcon = true
        
        // Fly in from bottom with subtle bounce
        // withAnimation(.interpolatingSpring(stiffness: 140, damping: 16)) {
        withAnimation(.spring(response: 0.6, dampingFraction: 0.7, blendDuration: 0)) {
            iconOffset = 0
        }
    }
}

struct SplashScreenView_Previews: PreviewProvider {
    static var previews: some View {
        SplashScreenView(isLoading: .constant(true), onAnimationComplete: {})
    }
} 
