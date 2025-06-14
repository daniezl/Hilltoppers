//
//  SplashScreenView.swift
//  SJA_re
//
//  Created by Daniel Zhang on 4/23/25.
//

import SwiftUI

struct SplashScreenView: View {
    @State private var iconOffset: CGFloat = 1000
    @State private var viewOffset: CGFloat = 0
    @State private var showIcon = false
    @State private var screenHeight: CGFloat = 0
    @State private var shouldSlideOut = false
    @Binding var isLoading: Bool
    let onAnimationComplete: () -> Void
    
    private let darkGreen = Color(red: 4/255, green: 54/255, blue: 21/255) // #043615
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Dark green background
                darkGreen
                    .ignoresSafeArea()
                
                // White circle icon
                Circle()
                    .fill(Color.white)
                    .frame(width: 80, height: 80)
                    .offset(y: iconOffset)
                    .opacity(showIcon ? 1 : 0)
            }
            .offset(y: viewOffset)
            .onAppear {
                screenHeight = geometry.size.height
                iconOffset = screenHeight
                startAnimation()
            }
            .onChange(of: isLoading) { newValue in
                if !newValue && !shouldSlideOut {
                    shouldSlideOut = true
                    // Loading is complete, slide out from top with a more dramatic animation
                    withAnimation(.easeIn(duration: 0.8)) {
                        viewOffset = -(screenHeight + 100) // Go a bit further off-screen
                    }
                    
                    // Call completion after animation finishes
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                        onAnimationComplete()
                    }
                }
            }
        }
    }
    
    private func startAnimation() {
        // Show the icon and start the fly-in animation
        showIcon = true
        
        // Fly in from bottom with bounce
        withAnimation(.interpolatingSpring(stiffness: 100, damping: 8)) {
            iconOffset = 0
        }
    }
}

struct SplashScreenView_Previews: PreviewProvider {
    static var previews: some View {
        SplashScreenView(isLoading: .constant(true), onAnimationComplete: {})
    }
} 