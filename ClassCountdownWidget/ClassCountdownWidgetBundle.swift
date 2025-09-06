//
//  ClassCountdownWidgetBundle.swift
//  ClassCountdownWidget
//
//  Created by Daniel Zhang on 9/6/25.
//

import WidgetKit
import SwiftUI

@main
struct ClassCountdownWidgetBundle: WidgetBundle {
    var body: some Widget {
        ClassCountdownWidget()
        ClassCountdownWidgetControl()
        ClassCountdownWidgetLiveActivity()
    }
}
