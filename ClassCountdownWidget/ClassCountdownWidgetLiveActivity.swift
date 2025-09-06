//
//  ClassCountdownWidgetLiveActivity.swift
//  ClassCountdownWidget
//
//  Created by Daniel Zhang on 9/6/25.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct ClassCountdownWidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct ClassCountdownWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ClassCountdownWidgetAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension ClassCountdownWidgetAttributes {
    fileprivate static var preview: ClassCountdownWidgetAttributes {
        ClassCountdownWidgetAttributes(name: "World")
    }
}

extension ClassCountdownWidgetAttributes.ContentState {
    fileprivate static var smiley: ClassCountdownWidgetAttributes.ContentState {
        ClassCountdownWidgetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: ClassCountdownWidgetAttributes.ContentState {
         ClassCountdownWidgetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: ClassCountdownWidgetAttributes.preview) {
   ClassCountdownWidgetLiveActivity()
} contentStates: {
    ClassCountdownWidgetAttributes.ContentState.smiley
    ClassCountdownWidgetAttributes.ContentState.starEyes
}
