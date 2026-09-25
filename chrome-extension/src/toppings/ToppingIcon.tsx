import { Sparkle, ChatCircleText, BookOpen, CalendarBlank, Clock, CheckSquare, MusicNote, Trophy, Lightbulb, Heart, Bell, Users } from '@phosphor-icons/react';
export const TOPPING_ICONS = [
  {id:'sparkle',label:'Sparkle',Icon:Sparkle}, {id:'chat',label:'Chat',Icon:ChatCircleText},
  {id:'book',label:'Book',Icon:BookOpen}, {id:'calendar',label:'Calendar',Icon:CalendarBlank},
  {id:'clock',label:'Clock',Icon:Clock}, {id:'checklist',label:'Checklist',Icon:CheckSquare},
  {id:'music',label:'Music',Icon:MusicNote}, {id:'trophy',label:'Trophy',Icon:Trophy},
  {id:'lightbulb',label:'Lightbulb',Icon:Lightbulb}, {id:'heart',label:'Heart',Icon:Heart},
  {id:'bell',label:'Bell',Icon:Bell}, {id:'people',label:'People',Icon:Users}
];
export default function ToppingIcon({icon,className}:{icon?:string;className?:string}) {
  const Icon=(TOPPING_ICONS.find(item=>item.id===icon)||TOPPING_ICONS[0]).Icon;
  return <Icon size={22} weight="regular" className={className} aria-hidden="true"/>;
}
