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
    @WidgetBundleBuilder
    var body: some Widget {
        ClassCountdownWidget()
        if #available(iOS 18.0, *) {
            ClassCountdownWidgetControl()
        }
        if #available(iOS 16.2, *) {
            ClassCountdownWidgetLiveActivity()
        }
    }
}
