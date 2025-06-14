import SwiftUI

struct LoadingView: View {
    @State private var rotation: Double = 0
    
    var body: some View {
        ZStack {
            Circle()
                .fill(Color.white)
                .frame(width: 40, height: 40)
                .rotationEffect(.degrees(rotation))
            
            Circle()
                .fill(Color(red: 20/255, green: 54/255, blue: 27/255))
                .frame(width: 30, height: 30)
                .rotationEffect(.degrees(-rotation * 1.2))
        }
        .onAppear {
            withAnimation(.linear(duration: 1.0).repeatForever(autoreverses: false)) {
                rotation = 360
            }
        }
    }
} 