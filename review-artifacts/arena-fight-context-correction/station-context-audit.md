# Station context audit

| Context | Authority/rendering | Result |
|---|---|---|
| Fight leaderboard | stats.fight_dashboard, full station_ids, ArenaPersonName | Production rendering already correct; corrected review fixtures now provide station_id/name |
| Fight recent activities | same participant context + station_name from stats API | Already correct; fixture now includes both stations |
| Fight event feed | FightEventFeed gets all standings IDs, event.station_name | Verified with browser + SSR, including one visible seller from a multistation fight |
| Seller contribution / Min Fight | clicked Fight person | Small presentation fix: station moved from dialog eyebrow to directly below person name; full participant context reused |
| Lead-change sale popup | FightAnnouncement, seller name + own station from fight standings | Already correct; verified by real registration-to-lead transition and SSR |
| Network people/recent | ArenaNetworkPeople and board.standings | Already correct; SSR verifies station below name even with only one visible seller |
| Local leaderboard/feed | single-station/default context | No station labels, browser verified |
| Local seller selector / Min Arena | local context | No station labels, browser verified |

Previous objective-review fixture copied local rows without station_name. The real API already supplies station fields (frozen participant/sale names). New shared e2e fixture uses Peter/Tingsryd, Alva/Karlskrona and alternating stations; remote person IDs are distinct. No scoring, scope, polling, tenant access or Competition Builder logic changed.
