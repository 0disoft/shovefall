# Static Release Procedure

- Status: `0.199.51` briefing loadout summary candidate; hosted proof pending
- Primary owner: Repository owner
- Current product version: `0.199.51`

Product `0.199.51`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The pre-round briefing now shows the selected loadout: starting attributes such as `완력 4 · 민첩 4`, the two starting skills, and the starting item, compressed on narrow phones and landscape so the briefing still fits one screen at standard and extra-large text. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.50`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. Starting-attribute cards now show per-point effect chips, such as `이동 +4.5%/점`, so players can see what each trait does before spending points, and below 300 px on fine-pointer windows the six stepper buttons shrink to fit inside their cards so the settings form no longer scrolls horizontally at 260 px. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.49`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On a 260 px screen, the filled scoreboard's two-column cells were 89 px wide, so values such as `점수 2,233` needed 94 px and spilled 5 px outside the cell; below 300 px coarse the cells now stack label above value so every number fits inside the cell without horizontal clipping. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.48`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On a 260 px screen with extra-large text, the 체력·마나 toggle's label grew wide enough to push the health and mana summary out of the button, leaving the summary invisible; below 300 px the label now collapses to an accessibility-only hidden span so the summary keeps the full button width and remains visible at every text size. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.47`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. During a live round on a 320×568 phone, the paused panel used the empty-statistics layout, so populated telemetry and round statistics overflowed the panel by about 66 px and required scrolling; the panel now compresses its action area, telemetry cells, statistics cells, and heading below 360 px coarse so the whole panel including populated values fits a 320×568 screen, the 체력·마나 toggle tightens its gap, padding, and font below 300 px so its label no longer clips by 4 px at 260 px, and touch action buttons size to the 68 px grid so the tablet control row no longer spills 8 px past the container at 768 px. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.46`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On cover-width screens up to 300 px, the completed and paused round statistics used the narrow-phone cell sizes, so values such as `100%` clipped inside 260 px cells and the completed panel fit with zero slack; the cells now tighten their font and padding at 300 px and below, values wrap instead of clipping, the completed panel gains about 27 px of slack, and the paused panel scroll shrinks by about 17 px. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.45`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The MAX attribute button added in `0.199.43` left the stepper grid with five tracks on desktop and cover-width screens, so the six buttons overlapped or spilled outside the card on coarse 260-320 px and narrow fine-pointer viewports; every stepper now declares six tracks with per-button widths, so `−5 · −1 · 값 · +1 · +5 · MAX` fit without overlap inside the card at 260 px coarse, 320 px coarse and fine, and desktop, and the allocation hint now mentions the MAX shortcut. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.44`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On narrow phones, the paused round panel used to stack status values below their labels and kept a folded control-guide summary, so a 320×568 screen scrolled before showing the statistics; the status cells now lay label and value on one line, the guide hides on the narrowest coarse-pointer screens, and the whole paused panel including telemetry and statistics fits a 320×568 viewport without scrolling. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.43`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. Every starting-attribute card now ends with a MAX button that fills all remaining points at once, disables itself when the total budget or the card's own cap is reached, and re-enables as soon as points are freed; a new smoke journey fills all 20 points, frees five, refills, and asserts the disabled and enabled states. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.42`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On narrow phones, the completed-round pause panel used to stack every statistics cell with the label above its value, so a 320×568 screen had to scroll about 123 px to reach the skill-use rows; the eleven statistics cells now lay label and value on one line in two columns, and the finished message, action buttons, and skill rows tighten so the whole panel, including two filled skill rows, fits a 320×568 viewport without scrolling. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.41`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On narrow phones, each filled scoreboard row used to stack its four stat cells in two rows with labels above values, growing to about 207 px; the stat cells now lay label and value on one line with tighter spacing, shrinking each row to about 161 px, and a new 320×568 scoreboard smoke journey seeds twelve entries and asserts the two-column cells, the row-height bound, and no horizontal overflow. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.40`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On foldable cover widths up to 280 px, the expanded 체력·마나 stat panel used to stay in four columns, squeezing every label into a 55 px cell so the mobility value wrapped to three lines and the tallest cell reached 149 px; standard text now lays the eight cells in two columns so values fit on two lines and the tallest cell drops to about 70 px; a new 260×653 cover-width smoke journey boots a real round and asserts the two-column panel, the cell-height bound, and the readout staying clear of the joystick. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.39`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On desktop viewports between 821 px and 1240 px wide, the expanded 체력·마나 stat panel used to span 58% of the screen and cover the centered renderer status chip; it now narrows to 42%, lays its eight cells in two columns with label and value on one line, and stays clear of the renderer status, action HUD, and skill buttons; a new 1024×768 desktop smoke journey boots a real round and asserts the readout stays clear of the renderer status and action HUD with the two-column strip. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.38`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On coarse-pointer landscape screens, the expanded 체력·마나 stat strip now lays its eight cells in two columns of four instead of four columns of two, so standard text fits on one screen without scrolling and extra-large text wraps to two lines per cell instead of five; the strip's height cap is anchored to the toggle so it never clips at the top of the viewport at any landscape height; the 568×320 landscape smoke journey now asserts the two-column strip, the no-scroll standard layout, and the readout and toggle staying above the joystick. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.37`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On coarse-pointer landscape screens, the expanded 체력·마나 stat panel used to grow downward from the top-left toggle and cover the joystick and touch buttons on short viewports; the toggle now anchors just above the joystick and the expanded four-column strip opens upward across the full width, capped to the available height, so it stays clear of the touch controls at every landscape height; a new 568×320 landscape smoke journey boots a real round and asserts the expanded readout and its toggle stay above the joystick while the strip spans the full width. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.36`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On short landscape screens, the standard-text pause panel now lays its round statistics in four compact columns with the same tight spacing as extra-large, shrinking the panel from about 676 px to about 502 px so the resume action and the first statistics row stay on the first screen; a new landscape standard-text pause smoke journey asserts the four-column statistics, the on-screen resume action, and the first statistics row. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.35`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The body no longer forces a 320 px minimum, so foldable cover screens down to 260 px wide no longer scroll horizontally, and under 300 px the settings tabs lay in one row of four with compact padding while the five-step attribute steppers shrink to 40 px targets, keeping the whole menu, settings form, and arena controls inside the viewport; a new foldable cover-width smoke journey asserts no horizontal overflow across the menu, all four settings tabs, the attribute steppers, and the arena controls at 260 px. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.34`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On short landscape screens with extra-large text, the pause panel used to grow past 700 px and push the resume action and most combat statistics below the fold; it now lays the round statistics in four compact columns with tighter spacing so the panel stays near 500 px and the resume button remains on the first screen; a new landscape extra-large pause smoke journey asserts the four-column statistics and the on-screen resume action. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.33`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On short landscape screens, skill and item cards now widen to one column with two-column effect rows and the save and cancel buttons sit side by side, so scrolling to the bottom of the settings form leaves the last card fully visible and tappable instead of clipped above the fold; a new landscape settings smoke journey asserts the last cards stay inside the viewport without overlapping the save bar. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.32`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The version-history screen now renders only the newest 30 entries with collapsed older entries compressed to compact rows and an `이전 버전 더 보기` button that reveals the remaining history on demand, shortening the initial phone document from about 19,500 px to about 2,300 px; a new smoke journey asserts the 30-entry opening, on-demand reveal, and no viewport overflow. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.31`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On desktop fine-pointer screens, the five-point attribute stepper buttons are now always visible and the six trait cards widen from three columns to a two-column three-row grid, so the full steppers fit inside their cards without clipping; a new smoke journey asserts the 5-step buttons stay visible and the two-column trait cards never clip their steppers. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.30`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. Whenever the touch controls appear, including narrow fine-pointer windows under 820 px, the pause trigger now moves to the top-right corner and the stat toggle stays visible with the expanded combat stats folded by default, so the joystick and touch action buttons are never covered; a new narrow fine-pointer smoke journey asserts the top-corner pause trigger stays clear of the joystick and touch actions while the stat panel starts folded. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.29`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On desktop fine-pointer screens, the paused control guide now starts folded and the pause action buttons lay in three columns with round statistics in four columns and tighter cells, shrinking the panel so the whole paused screen fits without scrolling at standard and extra-large text; a new smoke journey asserts the collapsed guide with three-column pause buttons and four-column statistics fit the panel without internal scroll. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.28`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On desktop fine-pointer screens, the completed-round action buttons now lay in three columns and the round statistics in four columns with tighter cells, shrinking the panel so the whole completed summary fits without scrolling at standard and extra-large text; a new smoke journey asserts the three-column buttons and two button rows fit the panel without internal scroll. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.27`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The coarse-pointer stat toggle on phones 420 px and narrower now caps its width using the pause button's real footprint and right margin, so the two controls keep at least an 8 px gap instead of touching; a new 390×844 smoke journey boots a real round and asserts the toggle stays clear of the pause trigger, and the existing 320×568 journey tightens its overlap tolerance to require a real gap. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.26`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. At extra-large text on 320 px-wide phones, loadout effect rows now use tighter line height and padding, shrinking the longest item card from 318 px to 279 px so every skill and item card stays under half the 568 px viewport; a new smoke journey asserts the longest item and skill cards at 320×568 extra-large remain within half the screen. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.25`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The version-history screen now keeps only the current entry expanded and collapses every past entry to a one-line version-and-title summary that expands on tap, shrinking the 320 px phone document from about 28,000 px to 20,600 px; a smoke journey asserts the current entry stays open, past entries collapse, and an expand action reveals the hidden copy. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.24`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On coarse-pointer phones 560 px and narrower, the completed-round action area now uses tighter padding and 48 px-tall buttons so the round statistics start about 31 px higher on a 320×568 phone; a new layout smoke keeps the actions above the statistics, every action button at least 44 px tall, and the panel scrollable without body overflow. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.23`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On coarse-pointer phones 420 px and narrower, the 체력·마나 toggle now caps its width so its filled health-and-mana summary truncates with an ellipsis instead of sliding under the top-right pause button; at 320×568 the two controls sit side by side without overlap. A new smoke journey boots a 320×568 round and asserts the joystick, touch actions, stat toggle, pause trigger, and expanded stat panel all stay clear of one another. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.22`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. With large or extra-large text, the expanded combat stat panel on phones 350 px and narrower now lays its eight cells in two columns instead of four, so labels like 피해·보호막 and values like `100 / 100` fit on one line without shrinking the user's chosen text size; the panel grows only in height and stays clear of the joystick. Standard text keeps the previous compact four-column layout. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.21`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The expanded in-round combat stat panel on phones now uses tighter cell padding, type, and gaps, so every label and value fits on one line even at 320 px wide, trimming the panel from about 124 px to 82 px tall with the toggle button unchanged. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.20`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The kill-reward trait picker on phones now lays each card as one icon-and-copy line with a full-width rank meter below, sizes cards to their content, and tightens the picker header, dropping the six-choice list's scroll height on a 320 px-wide phone from about 948 px to 732 px at the standard text size with no text clipping, so the first screen shows nearly two cards; tablets between 481 px and 820 px keep two columns with the list near 396 px. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.19`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The coarse-pointer pause layer on 320 px-wide phones now uses tighter panel padding, telemetry cell padding and gaps, round-statistics cell padding, type, and gaps, and skill-row padding, trimming the paused panel's scroll height from about 1028 px to 953 px at the standard text size and from 1146 px to 1071 px at extra-large, so the first round-statistics row reaches the first screen. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.18`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The two-column phone loadout cards between 376 px and 560 px now use slightly tighter card padding, meta chips, effect type, and line spacing, trimming the item catalog by about 15% and the skill catalog by 11-15% at phone widths with no text clipping. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.17`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The coarse-pointer in-round combat summary now carries only the health and mana numbers while the `체력·마나` label lives on the toggle button itself, so the one-line summary stays uncut at every text size, including extra-large on narrow phones. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.16`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The coarse-pointer pause round-statistics cells now share the landscape compact sizing (6 px padding, smaller dt/dd type) in portrait too, trimming the paused panel's scroll height on a 320×568 viewport from about 1070 px to 1028 px. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.15`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On coarse-pointer screens the in-round pause trigger grows to a 46 px touch target and moves from the bottom-center gap between the joystick and action buttons to the top-right corner, so it no longer crowds movement or skill controls in portrait or landscape. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.14`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. Phones from 376 px to 560 px wide now lay the skill and item loadout cards in two columns like tablets, cutting the catalog height by up to 40%; phones 375 px and narrower keep the single column so their cards stay readable. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.13`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On 560 px and narrower viewports the skill and item cards re-lay their art and name on one row and their effect text across the full card width with tighter type and padding, so the longest phone card drops from roughly 433 px to about 312 px and browsing the catalog needs less scrolling. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.12`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On coarse-pointer screens each starting-attribute card stacks vertically and gains `−5`/`+5` quick buttons beside the existing single-step steppers, so the 20-point budget fills in a few taps instead of twenty single clicks; the buttons disable at the point limits and keep hold-to-repeat. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.11`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On coarse-pointer screens the in-round combat readout collapses to a one-line `체력 … · 마나 …` summary that expands to the full four-column grid when tapped, so phones no longer lose the upper arena to a 160-210 px stat strip; the expanded grid keeps the same values and still clears the touch controls. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.10`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. On 480 px and narrower coarse-pointer screens the touch controls switch from a shrinking flex row to a two-column grid: the joystick keeps a fixed 96 px target and the four action buttons reflow into a 2x2 grid, so narrow phones no longer squash the joystick to 60 px or strand the fourth button on a second row. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.9`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The pre-round briefing compresses its heading, objective, control cells, status, and action spacing at large and extra-large text sizes so the objective, controls, and confirmation fit one 320×568 viewport without scrolling. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.8`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. Tablet-width settings lay the skill and item loadout cards in two columns between 561 px and 820 px, cutting settings scrolling by about a third without card-text clipping, while phones keep the single-column layout. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.7`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The volume sliders grow to a 30 px touch target on coarse-pointer screens, and the scoreboard and version-history cards tighten their mobile padding and gaps so more records fit one screen. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.6`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The coarse-pointer in-round combat readout compresses to a four-column strip with tighter type so it no longer overlaps the touch joystick or skill buttons on portrait or landscape phones. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.5`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The main menu compacts on viewports under 560 px tall so landscape phones fit every action from `게임 시작` through `소스 코드` on one screen without scrolling. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.4`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The settings screen on coarse-pointer and narrow viewports pins the save/cancel actions to the bottom edge as a translucent sticky bar so `설정 저장` stays reachable while the form scrolls, short viewports under 560 px compact the masthead and heading, and single-column attribute cards on 480 px or narrower screens tighten height and padding. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.3`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The pre-round briefing dialog caps itself to the viewport, scrolls internally when needed, and on coarse-pointer devices compresses to a two-column control grid in portrait and a single four-column row in landscape, so the objective, controls, and confirmation reach one screen on 390×844 and 844×390 viewports. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.2`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. Coarse-pointer landscape pause lays round statistics in three columns, action buttons in one four-column row, and current-state telemetry in five columns with tighter cell and panel spacing, so resume, restart, and core statistics reach the first landscape screen with far less scrolling. Desktop pause trims panel gaps and statistic-cell padding so the full layer, including the controls guide, fits an 800 px viewport. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.1`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The pause layer on coarse-pointer devices compresses current-state telemetry and round statistics into two columns, tightens their cell padding, and collapses the controls guide behind a toggle row, so resume, restart, and menu actions plus core round values reach the first pause screen without long scrolling. Desktop keeps the open four-column statistics and expanded guide. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.199.0`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. Setup attribute steppers repeat while held after a 360 ms delay at 90 ms intervals, Ctrl/Meta-click still applies five points, and coarse-pointer devices see a touch hold hint instead of the desktop-only Ctrl hint. The twelve-value derived combat summary collapses behind a toggle row on narrow or coarse-pointer screens so the six attribute steppers reach the first viewport, while desktop keeps the open four-column summary. During play, coarse-pointer devices hide the desktop Q-W-E-D action HUD because the touch buttons mirror cooldown, mana, and blocked states, and the combat readout moves to a compact three-column strip below the renderer status instead of covering the touch controls. These changes are presentation-only and do not alter simulation, AI, replay hashes, or balance; checked-in replay fixtures stay untouched. Hosted proof and physical-device validation remain pending.

Product `0.198.1`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. The browser tab now uses a deterministic 256×256 transparent crop of the first stable grass tile from the accepted terrain atlas. Simulation, AI, balance, arena layout, and replay hashes are unchanged. Hosted proof and physical browser-tab readability remain pending.

Product `0.198.0`, simulation `84.0.0`, and content `50.0.0` keep replay v8 and reports v11. Public play expands from 60 to 70 participants and from a 52×44 to a 57×48 arena, increasing the rectangular cell count by 19.6%. The twelve separated lakes, 96-tile lake budget, and exactly 60 public trees remain unchanged. Game configuration, actor commands, browser settings, public audits, capture metadata, browser profiles, tests, and checked-in replay fixtures share the new bounds. Controlled 60-actor trait/loadout audits retain their exact experiment layout. Fresh 70-participant profile, audit, hosted, and human-play evidence remains pending.

Product `0.197.0`, simulation `83.0.0`, and content `50.0.0` keep replay v8 and reports v11. Loaded character art now keeps only the blue human foot marker and explicit equipped-item badges, removing the overlapping mass and control-state trails, rings, and glyphs. Generated cannonball art suppresses the procedural cannon circle for the same shot while missing art retains that fallback. Flight timing, impacts, simulation hashes, AI, and balance are unchanged. Checked-in replay fixtures are regenerated only for the product-version envelope; hosted proof and human readability validation remain pending.

Product `0.196.0`, simulation `83.0.0`, and content `50.0.0` keep replay v8 and reports v11. The public 52×44, 60-participant island now starts with exactly 60 inland trees while smaller internal arenas keep the existing density rule and 36-tree cap. Tree spacing and participant clearance stay unchanged. Checked-in replay fixtures are regenerated for the new version envelope. The focused-trait `0.194.0` audit artifact remains stale; hosted proof, public-scale performance evidence, and human pathing validation remain pending.

Product `0.195.0`, simulation `82.0.0`, and content `50.0.0` keep replay v8 and reports v11. Agility now reduces mana costs by 3% per point, Spirit increases mana regeneration by 15% per point, and Soap stuns for 1.5 seconds after damage. Checked-in replay fixtures are regenerated because authoritative mana regeneration, skill costs, item control timing, and hashes change. The focused-trait `0.194.0` audit artifact is stale until rerun; hosted proof and human balance validation remain pending.

Product `0.194.0`, simulation `81.0.0`, and content `49.0.0` keep replay v8 and reports v11. Blink Step now moves at most five tiles and evades attacks for 2.5 seconds. Arc Bolt costs 26 mana and reuses after four seconds. Soap keeps its two-second slide and damage 30 but stuns for only one second after damage. Checked-in replay fixtures require regeneration because authoritative movement, combat timing, cooldown, mana, and hashes change. The `0.192.0` balanced audit artifact remains stale until rerun; hosted proof and human balance validation remain pending.

Product `0.193.0`, simulation `80.0.0`, and content `48.0.0` keep replay v8 and reports v11. Continuous unsupported grace falls from 30 ticks (0.5 seconds) to 18 ticks (0.3 seconds), while the subsequent 24-tick Falling duration, supported-land recovery, and automatic Boat support remain unchanged. Checked-in replay fixtures are regenerated because authoritative support timing and hashes change. The `0.192.0` balanced audit artifact is stale until rerun; hosted proof and human timing validation remain pending.

Product `0.192.0`, simulation `79.0.0`, and content `48.0.0` keep replay v8 and reports v11. Camera shake no longer offsets the rendered world. Arc Bolt and Chain Bind now create hash-owned pending projectiles at six tiles per second and apply their damage, knockback, mana steal, dodge, and control when the visible projectile tip first reaches the target body's outer edge. In-flight skill projectiles remain visible outside the transient-effect cap, including under reduced motion. Checked-in replay fixtures are regenerated because authoritative skill timing and hashes change. Hosted proof, crowded-combat readability, and human timing validation remain pending.

Product `0.191.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Item spawn blocked tile IDs now build a Set directly from wall, tree, and soap patch iterations instead of allocating three intermediate arrays and spreading them, reducing per-tick allocation. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.190.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot blocked tile IDs now build a Set directly from wall and tree iterations instead of allocating two intermediate arrays and spreading them, reducing per-tick allocation. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.189.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Spatial hash cell buckets now skip per-bucket sorting since participants are already inserted in actorId order, removing a per-tick sort cost with no effect on cell content order. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.188.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Spatial hash getCandidatePairs now iterates participants in Map insertion order instead of re-sorting already-sorted values, removing a per-tick sort cost with no effect on pair generation order. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.187.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Spatial hash queryNearby now returns participants without sorting on every call, removing a per-bot-decision sort cost that had no effect on selection results. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.186.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot target selection now selects the highest-scored opponent with a single-pass maximum-score scan instead of allocating, mapping, sorting, and indexing the nearby candidate list per bot decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.185.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot item candidate selection now selects the nearest valid items with a single-pass top-N insertion scan instead of allocating, mapping, filtering, sorting, and slicing the full perceived item list per bot decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.184.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot nearby candidate selection now selects the nearest opponents with a single-pass insertion-sort top-N scan instead of allocating, mapping, sorting, and slicing the full perceived participant list per bot decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.183.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Simulation remaining distances now compute skill zone offset and wall occupancy distance from raw components instead of allocating subtractVectors and vectorLength intermediate objects per zone and wall check. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.182.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Simulation shove now computes target delta, distance, normal, cone cosine, forward speed, impulse magnitude, accumulated impulse, velocity merge, and stumble threshold from raw components instead of allocating subtractVectors, vectorLength, scaleVector, dotVectors, and addVectors intermediate objects per shove contact. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.181.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Simulation weak contact resolution now computes pair delta, distance, normal, relative normal speed, swept contact velocity, overlap position correction, and contact velocity correction from raw components instead of allocating subtractVectors, vectorLengthSquared, scaleVector, dotVectors, and addVectors intermediate objects per contact pair per iteration. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.180.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Simulation position integration and zone impulse now compute position integration, wall reflection, skill zone offset, zone impulse, and impulse strength from raw components instead of allocating addVectors, subtractVectors, scaleVector, dotVectors, and vectorLength intermediate objects per position step and zone pulse. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.179.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Simulation movement now computes input direction normalization, per-action velocity scaling, soap slip speed, grapple target velocity, and maximum-speed length from raw components instead of allocating normalizeVector, isZeroVector, scaleVector, and vectorLength intermediate objects per participant per tick. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.178.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Simulation wall hit and item placement now compute wall hit position, brick and soap cast range distance, and soap slide speed from raw components instead of allocating addVectors, scaleVector, subtractVectors, and vectorLength intermediate objects per wall hit and item placement. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.177.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Simulation grappling hook now computes grapple direction, target velocity, and anchor vector from raw components instead of allocating subtractVectors and scaleVector intermediate objects per grapple cast. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.176.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Simulation bomb impulse and brick dismount now compute blast offset, edge distance, impulse magnitude, accumulated impulse, and dismount destination from raw components instead of allocating subtractVectors, vectorLength, scaleVector, and addVectors intermediate objects per bomb blast and dismount decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.175.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Simulation skill impulse, anchored dismount direction, skill zone offset, and move target direction now compute impulse vectors, direction normalization, zone offsets, and target offsets from raw components instead of allocating scaleVector, normalizeVector, isZeroVector, subtractVectors, addVectors, and vectorLength intermediate objects per skill and movement decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.174.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Simulation swept-circle contact now computes relative motion, quadratic coefficients, contact positions, distance, and collision normal from raw components instead of allocating subtractVectors, vectorLengthSquared, dotVectors, addVectors, scaleVector, and vectorLength intermediate objects per collision check. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.173.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Simulation collision and aim assistance now compute ray-circle entry distance, swept-point bounds contact, ray-tile entry distance, and aim-assisted circle hit from raw components instead of allocating subtractVectors, dotVectors, vectorLengthSquared, vectorLength, scaleVector, addVectors, and isZeroVector intermediate objects per collision and aim decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.172.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Simulation direction helpers now compute direction and fallback normalization from raw components instead of allocating normalizeVector, isZeroVector, vectorLength, and scaleVector intermediate objects per direction decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.171.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Human input now computes target approach distance, move destination distance, and move direction normalization from raw components instead of allocating normalizeVector, subtractVectors, and vectorLength intermediate objects per human input frame. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.170.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Item placement and actor command normalization now compute spawn clearance distance and move-vector normalization from raw components instead of allocating vectorLength, subtractVectors, and normalizeVector intermediate objects per placement and command. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.169.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Skill targeting and projectile travel now compute direction normalization and travel distance from raw components instead of allocating normalizeVector, subtractVectors, and vectorLength intermediate objects per targeting and projectile render decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.168.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot navigation now computes pathfinding distances, direct direction, waypoint direction, tile escape distance, dodge landing depth, and safe dodge candidate rotation from raw components instead of allocating normalizeVector, subtractVectors, vectorLength, dotVectors, and rotateVector intermediate objects per navigation and dodge decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.167.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot stalled escape now computes desired, separation, inward, and per-candidate direction from raw components instead of allocating addVectors, dotVectors, normalizeVector, scaleVector, subtractVectors, and vectorLength intermediate objects per escape decision, and selects the best candidate with a single-pass maximum-score scan instead of allocating, filtering, sorting, and indexing an eight-element array. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.166.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot blended movement now computes move-center blend and normalization from raw components instead of allocating addVectors, scaleVector, and normalizeVector intermediate objects per fallback decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.165.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot crowd escape now computes crowd center and away direction from raw components instead of allocating addVectors, scaleVector, subtractVectors, and normalizeVector intermediate objects per escape decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.164.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot soap retreat now computes away-from-target, retreat direction, and soap target position from raw components instead of allocating subtractVectors, normalizeVector, addVectors, scaleVector, and vectorLength intermediate objects per retreat decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.163.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot item candidate filtering and bomb proximity now compute distances from raw components instead of allocating subtractVectors and vectorLength intermediate objects per candidate per check. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.162.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot bomb escape now computes away-from-bomb direction from raw components instead of allocating subtractVectors, normalizeVector, and vectorLength intermediate objects per escape decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.161.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot stall detection now computes progress distance and intent magnitude from raw components instead of allocating subtractVectors and vectorLength intermediate objects per decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.160.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot pursuit path now computes direct and jittered direction from raw components instead of allocating subtractVectors, normalizeVector, and rotateVector intermediate objects per decision, and removes the now-unused rotateVector helper. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.159.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot item placement now computes away-from-item direction and placement target from raw components instead of allocating subtractVectors, normalizeVector, vectorLength, addVectors, and scaleVector intermediate objects per item per decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.158.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot item claimant selection now finds the nearest eligible collector in a single pass instead of allocating filter, map, sort, and index intermediate arrays per item. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.157.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot perpendicular evasion now computes center direction and dot products from raw components instead of allocating subtractVectors, normalizeVector, and dotVectors intermediate objects per decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.156.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot skill selection now computes target distance from raw components instead of allocating subtractVectors and vectorLength intermediate objects per skill slot per decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.155.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot item assignment now finds the nearest eligible pursuer in a single pass instead of allocating filter, map, sort, and index intermediate arrays per item. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.154.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot item pursuit now computes distances from raw components instead of allocating subtractVectors and vectorLength intermediate objects per candidate per check. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.153.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot steered movement now computes normalization, rotation, scaling, and addition from raw components instead of allocating normalizeVector, rotateVector, scaleVector, and addVectors intermediate objects per decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.152.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot crowd avoidance now accumulates separation vectors from raw components instead of allocating subtractVectors, vectorLength, normalizeVector, scaleVector, and addVectors intermediate objects per candidate per decision. Visible bot movement, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.151.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Bot threat detection now computes distance, direction, and dot products from raw components instead of allocating subtractVectors, vectorLength, scaleVector, and dotVectors intermediate objects per candidate per decision. Visible bot dodge timing, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.125.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Earning a stat point from a human kill now plays a brief bright cue, adding audible reward feedback to the existing kill flash. The cue fires only for the human player's kills and is presentation-only. Combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.124.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. The kill-reward trait dialog now traps Tab and Shift+Tab within its focusable choices and save button so keyboard focus cannot leave the modal while it is open. Combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.123.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Saving a kill-reward trait upgrade now triggers a brief gold vignette pulse so growth feels more immediate. The effect respects the browser reduced-motion preference and is presentation-only. Combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.122.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. The 16-layer camera parallax array is now built once and reused instead of allocating a new array literal each frame, reducing per-frame allocation. Visible parallax, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.121.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. The per-frame set of dangerous cannon targets is now built with a single loop instead of filter+map intermediate arrays, reducing per-frame allocation. Visible warnings, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.120.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. The per-frame depth sort that orders participants, brick walls, and trees now uses numeric tie-break keys instead of building sort strings and calling localeCompare, reducing per-frame allocation and comparison work. Visible draw order, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.119.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Terrain tile lookup now uses a numeric tile key instead of per-frame string interpolation and intermediate arrays, cutting render work each frame on the 60-participant island. Visible water and land, combat results, replay hash, and balance are unchanged. Hosted proof, complete-collapse pacing, and human readability remain pending.

Product `0.118.0`, simulation `78.0.0`, and content `48.0.0` keep simulation `78.0.0`,
content `48.0.0`, replay v8, and reports v11. Opening the kill-reward trait dialog
now interrupts any in-progress pointer movement or destination tap, and pointer
controls stay inert while the simulation is paused for the upgrade choice, so the
movement vector cannot bleed into the resumed round. None of this enters the
simulation, replay hash, or combat balance. Hosted proof, complete-collapse pacing,
and human readability remain pending.

Product `0.117.0`, simulation `78.0.0`, and content `48.0.0` add presentation-only
combat feedback: a distance-falloff camera shake on Bomb detonations, cannon
impacts, skill hits, and eliminations, a red vignette flash when the human
takes damage, a gold pulse when a nearby participant is eliminated, and a deep
red fade when the human falls. All respect the browser reduced-motion
preference and none enter the simulation or replay hash. Replay stays v8 and
reports remain v11. Hosted proof, complete-collapse pacing, and human
readability remain pending.

Product `0.116.0`, simulation `78.0.0`, and content `48.0.0` remove the
surviving rock-shot state, launch scheduling, prediction, audio, presentation,
and hash entries that `0.115.0` declared gone but left in the simulation, AI,
renderer, and balance tooling. Pirate cannon flooding through the final stable
tile is unchanged, so replay hashes shift only by the removed rock fields while
round outcomes stay identical. Replay stays v8 and reports remain v11. Hosted
proof, complete-collapse pacing, and human readability remain pending.

Product `0.115.0`, simulation `77.0.0`, and content `48.0.0` remove the
protected land floor, per-ship ammunition counters, and terminal rock phase.
The sixteen ships retain independent firing clocks and one-warning/one-shot
target ownership while accepted impacts expose the next coast until every
stable land tile has flooded. Replay stays v8 and reports remain v11. Hosted
proof, complete-collapse pacing, and human readability remain pending.

Product `0.114.0`, simulation `76.0.0`, and content `48.0.0` keep the same game rules. Arc Bolt and Chain Bind keep immediate deterministic hit resolution while their generated projectile art travels from caster to impact at three tiles per second. Starting attributes and kill-reward traits use the same six Korean names. The live
defense readout names damage reduction and shield strength instead of Dodge
reuse, skill descriptions call their cone assistance automatic aiming, and the
pre-round briefing plus recent version notes use one concise casual tone.
Replay stays v8 and reports remain v11. Hosted proof and a fresh balance audit
remain pending.

Product `0.113.0`, simulation `76.0.0`, and content `48.0.0` reduce Soap to
four charges and Meteor Mark to 32 damage. Forward-target selection no longer
allocates and sorts all candidates per cast, skill zones reuse one actor ordering
per tick, and generated skill sprites suppress the duplicate procedural pass.
Replay stays v8 and reports remain v11. The `0.112.0` balance artifact is stale;
hosted proof, a fresh balance audit, and measured browser-frame evidence remain pending.

Product `0.112.0`, simulation `75.0.0`, and content `47.0.0` raise Soap's
delayed damage to 30, move Frost Field to 38 mana and a ten-second cooldown,
and change Bomb to 60 damage with a 25% installer share. Agility movement rises
to 4.5% per point while Constitution health falls to 1.5 per point. Replay stays
v8 and reports remain v11. Prior balance evidence is stale; hosted proof and a
fresh balance audit remain pending.

Product `0.111.0`, simulation `74.0.0`, and content `46.0.0` remove ordinary
ground from Grappling Hook acquisition. Only a tree or Brick wall can accept a
cast, and a miss spends no cooldown. A successful pull now accelerates for all
16 pull ticks and stops through shared obstacle collision instead of decaying
after its initial impulse. Replay stays v8 and reports remain v11. Hosted proof
and human movement-feel validation remain pending.

Product `0.110.0`, simulation `73.0.0`, and content `45.0.0` separate the
public survival rule from bounded automation. No public round time limit. The
browser continues until one participant remains or nobody survives. Balance,
profile, replay-fixture, and test worlds still provide explicit numeric limits.
Replay stays v8 and reports remain v11. Hosted proof and long human-round pacing
validation remain pending.

Product `0.109.0`, simulation `72.0.0`, and content `45.0.0` explain the
pirate-cannon flooding loop in the held pre-round briefing. Every pirate ship
retains an independent seeded firing clock but launches every 90–135 ticks
instead of every 120–180 ticks. The 185-tick flight and launch-synchronized
warning remain unchanged. Replay stays v8 and reports remain v10. Hosted proof,
a fresh balance audit, and human pacing validation remain pending.

Product `0.108.0`, simulation `71.0.0`, and content `45.0.0` separate Soap
from generic stumble motion. The victim keeps moving in the captured entry
direction for the definition-owned two-second slide, opposing input cannot
cancel it, and blocking obstacles still stop the body. Replay stays v8 and
reports remain v10. Hosted proof and a fresh balance audit remain pending.

Product `0.107.0`, simulation `70.0.0`, and content `44.0.0` add a
main-menu pre-round briefing. The round is constructed behind the dialog and
held at tick zero; the arena and existing countdown begin only after the ready
confirmation. Restart remains an immediate rematch path. Replay stays v8 and
reports remain v10. Local focused browser proof, hosted CI, Pages, and
physical-device proof are pending.

Product `0.106.1`, simulation `70.0.0`, and content `44.0.0` suppress browser
context menus inside the game application. Active-arena right-click movement and
target cancellation still run through the existing pointer controller before
the event bubbles to the application guard. Replay stays v8 and reports remain
v10. Local browser, hosted CI, Pages, and physical-device proof are pending.

Product `0.106.0`, simulation `70.0.0`, and content `44.0.0` raise Arc Bolt
damage to 25 and Blink Step to four tiles plus two seconds of attack evasion.
Collector bots restrict pursuit to nearby safe interior items and consume usable
occupied active slots before collecting a replacement. Final rocks predict a
bounded 24-tick movement lead and launch one through three distinct-target
shots per 48–72-tick volley with a 0.95-tile lethal radius. Replay stays v8 and
reports remain v10. Deterministic fixtures, local validation, a fresh balance
audit, hosted CI, Pages, and human playtest proof are pending.

Product `0.105.0`, simulation `69.0.0`, and content `43.0.0` widen Arc Bolt
and Chain Bind aim assistance, lower Frost Field damage healing from 15% to
10%, and shorten protected-core rock launch intervals to 66, 48, and 36 ticks.
Soap bots place ahead of their retreat and retain a two-second escape intent;
Survivor and Collector weights reduce passive avoidance and distant-item
pursuit. Replay stays v8 and reports remain v10. Deterministic fixtures and the
requested same-seed 80-round random-trait artifact are current: all 80 rounds
and 4,800 actor-rounds completed with zero automatic balance flags. Hosted CI,
Pages, and human playtest proof remain pending.

Product `0.104.1`, simulation `68.0.0`, and content `42.0.0` preserve the
visible 0–100 sound controls while remapping level 50 from -20 dB to -8 dB,
equal to the former level-80 output. Zero remains silent, 100 remains full
output, the music reference trim and combat ducking remain unchanged, and
persisted browser values require no migration. Replay stays v8 and reports
remain v10. Hosted CI, Pages, and device-level listening proof are pending.

Product `0.104.0`, simulation `68.0.0`, and content `42.0.0` reject arena
bounds that cannot provide one unique tile per participant, accept the public
52-column arena in replay parsing, and preserve all six direct trait commands.
Bots consume the same effective Dodge and Bomb tuning as the world. Balance
snapshots from another product, simulation, or content version fail closed
instead of rendering as current evidence. Replay stays v8 and reports remain
v10. Hosted CI, Pages, browser performance, and a fresh balance audit are
pending.

Product `0.103.1`, simulation `67.0.0`, and content `42.0.0` render Blink Step's
three-tile movement and one-second evasion as two separate effect rows, matching
the other skill cards without changing combat. Replay stays v8 and reports stay
v10. Hosted CI, Pages, and browser smoke evidence are pending.

Product `0.103.0`, simulation `67.0.0`, and content `42.0.0` raise Agility's
mana-cost reduction to 2% per point, lower Chain Bind to 30 mana, and extend
Blink Step to three tiles with one second of evasion. Frost Field now lasts four
seconds, and its definition-derived copy explicitly labels four damage per
second. Changed combat outcomes require replay fixture regeneration under replay
v8; reports remain v10. Hosted CI, Pages, and human balance evidence are pending.

Product `0.102.0`, simulation `66.0.0`, and content `41.0.0` raise Agility
movement to 3.5% per point and Balance to 5% impulse resistance plus 4% control
reduction per point. Chain Bind now transfers up to 10 actual current mana from a
hit target to its living caster. Arc Bolt falls to 30 mana and a five-second
cooldown. The content definitions own the values used by simulation, AI, and
descriptions. Changed combat outcomes require replay fixture regeneration under
replay v8; reports remain v10. Hosted CI, Pages, and human balance evidence are
pending.

Product `0.101.0`, simulation `65.0.0`, and content `40.0.0` give Soap five
charges and a two-second post-slide stun, raise Arc Bolt to 22 damage with a
one-second stumble, and move Frost Field to 34 mana with a nine-second cooldown.
The effects and music controls now share a perceptual decibel curve; the music
bus carries a fixed 0.08 reference trim and ducks by 5 dB for short player combat
impacts. New users start both controls at 50 while persisted choices remain
unchanged. Changed combat outcomes require replay fixture regeneration under
replay v8; reports remain v10. Hosted CI, Pages, and human balance evidence are
pending.

Product `0.100.0`, simulation `64.0.0`, and content `39.0.0` apply the reviewed
skill and item balance pass. Soap keeps its two-second slip and then applies a
separate 1.2-second stun before control returns. Brick Bag falls from four to
three charges. Bomb owners take 20% of the definition-owned 65 damage while
retaining the existing blast impulse. Frost Field deals four damage per pulse,
slows by 20%, and heals 15% of actual damage; Aegis keeps 22 shield but lasts
four seconds. Descriptions derive from the same item and skill definitions.
Changed combat outcomes require replay fixture regeneration under replay v8;
reports remain v10. Hosted CI, Pages, and human balance evidence are pending.

Product `0.99.0`, simulation `63.0.0`, and content `38.0.0` make every kill-reward level identical to one matching pre-round trait point. The progression table now derives from the starting-attribute coefficients and includes previously missing mass, mana-cost, stumble, skill-damage, control-duration, and shield effects. Browser reward names match setup names, while legacy progression IDs remain unchanged for replay and report compatibility. Combat outcomes and hashes change, so replay fixtures regenerate under v8; reports remain v10. Hosted CI, Pages, and human balance evidence are pending.

Product `0.98.3`, simulation `62.0.0`, and content `38.0.0` add a short two-layer procedural click cue to enabled non-gameplay buttons. Skill, Grappling Hook, and item action buttons remain excluded so their action-specific sounds stay legible. The background-music default falls from 35 to 10 for users without a stored value; explicit persisted values remain unchanged. Effects volume, mute behavior, optional-audio failure, simulation, replay hashes, reports, and content remain unchanged.

Product `0.98.2`, simulation `62.0.0`, and content `38.0.0` replace the shared single-oscillator skill cue with definition-specific layered procedural audio. Blink Step, Arc Bolt, Chain Bind, Meteor Mark, Frost Field, and Aegis use distinct pitch contours and timbres; damaging skills also receive distinct impact cues. Human casts and hits receive a bounded voice-priority boost so nearby bot activity cannot consistently mask player feedback. Voice limits, independent effects volume, mute state, optional-audio failure, simulation, replay hashes, reports, and content remain unchanged.

Product `0.98.1`, simulation `62.0.0`, and content `38.0.0` restore readable walking motion for the loaded character atlases. Animated sprites now retain most of the deterministic stride offset, lift, squash, stretch, and rotation instead of suppressing those transforms after artwork loads. The simulation, combat rules, replay hashes, reports, and content remain unchanged.

Product `0.98.0`, simulation `62.0.0`, and content `38.0.0` add the officially distributed `HYP - Catch Me If You Can` MP3 as same-origin looping background music. The first accepted pointer or keyboard gesture starts playback without waiting for a round; menu, setup, and arena transitions keep the same element alive. Browser-local settings persist independent effects (default 50) and music (default 35) volume, while the existing global sound control mutes both channels. Audio rejection remains non-blocking. Replay, reports, simulation, and content remain unchanged.

Product `0.97.1`, simulation `62.0.0`, and content `38.0.0` add diagonal-only shoreline cutouts derived from the same four cardinal coast sources. Interior tiles beside diagonal water no longer use terrain overscan, preventing rectangular grass shelves from covering lakes and inlets. Simulation topology, replay, reports, and content remain unchanged.

Product `0.97.0`, simulation `62.0.0`, and content `38.0.0` replace desktop mouse-drag joystick movement with right-click ground destinations. New destinations replace old ones; arrow, gamepad, and touch-joystick movement cancel destination travel; unsupported destinations stop movement. Left-click remains reserved for aim confirmation, while right-click still cancels an active aim. The centered fullscreen menu and player-preference rules from `0.96.x` remain unchanged; replay stays v8 and reports stay v10.

Product `0.94.6`, simulation `60.0.0`, and content `36.0.0` replace the six active skill-card icons with individually generated, role-colored RGBA cutouts: violet movement, gold projectile, crimson control, orange impact, blue-white zone, and emerald-gold defense. Replay stays v8 and reports stay v10 because the change is presentation-only.

Product `0.94.5`, simulation `60.0.0`, and content `36.0.0` label the paired Skill Efficiency values as cooldown wait and mana consumption on one line, with hover and keyboard-focus help. Replay stays v8 and reports stay v10 because the change is presentation-only.

Product `0.94.4`, simulation `60.0.0`, and content `36.0.0` add a menu-owned source-code link to the public GitHub repository with a new-tab opener boundary. Replay stays v8 and reports stay v10 because the change is presentation-only.

Product `0.94.3`, simulation `60.0.0`, and content `36.0.0` replace developer-facing target-tile wording with range-derived placement instructions for Soap, Brick Bag, and Bomb. Replay stays v8 and reports stay v10 because the change affects presentation copy only.

Product `0.94.2`, simulation `60.0.0`, and content `36.0.0` place the twelve derived combat values in a three-column grid and the six starting traits in a matching three-column grid on wide screens. Both grids step down to two columns on tablets and one column on narrow phones. Replay stays v8 and reports stay v10 because the change is presentation-only.

Product `0.94.1`, simulation `60.0.0`, and content `36.0.0` keep pickup Soap as an upright generated item with a yellow pickup marker, while installed Soap becomes a flat translucent foam hazard with an exclamation mark and installer-colored rim. Replay stays v8 and reports stay v10 because the change is presentation-only.

Product `0.94.0`, simulation `60.0.0`, and content `36.0.0` restore Soap as a four-charge ground trap with owner immunity, a one-second stumble, and delayed ordinary damage. Wind Blast leaves the item contract and Force Palm leaves the skill contract, including setup, bots, renderer effects, statistics, and generated replay fixtures. Replay advances to v8 and local round reports to v10 so payloads naming retired identifiers are rejected instead of silently reinterpreted.

Product `0.93.1`, simulation `59.0.0`, and content `35.0.0` keep the `0.93.0` item-contention and Soap-removal rules, then make every pair of desktop skill or item cards stretch to the intrinsic height of the longer card. Replay stays v7 because the change affects only DOM and CSS presentation.

Product `0.92.0`, simulation `58.0.0`, and content `34.0.0` retire Tidal Charge from setup, runtime, bots, effects, and statistics. Replay advances to v6 because older setup payloads may name the retired skill. The seven active skills form 21 pairs. Skill and item settings use two-column content-height cards; the retained Tidal Charge art remains provenance-only and is not loaded.

Product `0.91.1`, simulation `57.0.0`, and content `33.0.0` align every starting skill and item card to shared title, metadata, artwork, and effect-panel tracks. Description length no longer vertically recenters one card away from its siblings. Definition-derived copy, selection behavior, simulation, and content remain unchanged.

Product `0.91.0`, simulation `57.0.0`, and content `33.0.0` reduce the built-in Grappling Hook cooldown from 900 ticks (15 seconds) to 630 ticks (10.5 seconds). Human input, bot readiness, HUD copy, lab defaults, and command acceptance continue to derive from the same definition. Replay fixtures are regenerated under the new simulation envelope.

Product `0.90.1`, simulation `56.0.0`, and content `33.0.0` remove obsolete hand-shove sliders from the development-only tuning contract after public `E` became the built-in Grappling Hook. The lab now exposes only values reachable by current commands, while HUD and pause copy name attack power, Dodge reuse, and the Grappling Hook directly. Authoritative round behavior is unchanged.

Product `0.90.0`, simulation `56.0.0`, and content `33.0.0` derive player-facing base knockback tiles from each skill's impulse and stumble duration plus the same launch-speed cap and stumble drag used by runtime movement. Stun and stumble durations are shown in seconds, including Meteor Mark's previously unlabeled duration. Rules and deterministic state remain unchanged.

Product `0.89.1`, simulation `56.0.0`, and content `33.0.0` separate Meteor Mark's dark stone-and-chain silhouette from the settings card with a bounded warm halo and slightly larger art scale. Other skill art and all game rules remain unchanged.

Product `0.89.0`, simulation `56.0.0`, and content `33.0.0` replace the lightweight SVG skill strip with eight owner-generated 256×256 transparent PNG cutouts. Settings retain text fallbacks and game rules remain unchanged.

Product `0.88.3`, simulation `56.0.0`, and content `33.0.0` compose multi-edge shoreline corners from the same cardinal coast sources used by straight edges, removing mismatched atlas-corner seams around lakes and inlets.

Product `0.88.2`, simulation `56.0.0`, and content `33.0.0` increase the shared arena camera zoom from 1.08× to 1.15× while keeping rendering, targeting, and spectator coordinates on one projection.

Product `0.88.1`, simulation `56.0.0`, and content `33.0.0` preserve held arrow state while keyboard targeting suppresses movement commands, so a cast or cancellation resumes an uninterrupted held direction without requiring another keydown.

Product `0.88.0`, simulation `56.0.0`, and content `33.0.0` expand the public arena from 48×40 to 52×44, increasing the rectangular tile budget by 19.2% while preserving the twelve-lake policy and connected 10%-or-lower core. The shared Pixi projection applies an 8% camera zoom so rendering, targeting, and spectator bounds stay aligned. Existing balance and performance reports predate this candidate.

Product `0.84.0`, simulation `55.0.0`, and content `33.0.0` replace static-body transform theater with sixty-four generated idle, walk, cast, and hit frames across all sixteen participant appearances. Four reviewed chroma sources are converted to validated 768×768 alpha atlases; runtime failure falls back to the original static atlas. Browser-scale crowd readability, payload cost, and physical-device motion remain promotion gates.

Product `0.86.0`, simulation `55.0.0`, and content `33.0.0` remove duplicate Pixi scene submissions from targeting, stop paused-frame redraws, redraw countdowns only on visible changes, limit HUD telemetry to 10 Hz, and harden pointer/gamepad targeting ownership. Simulation, balance, replay, and report contracts remain unchanged.

Product `0.86.1`, simulation `55.0.0`, and content `33.0.0` prevent long derived-combat values from collapsing Korean labels into vertical fragments and place each attribute's decrease, value, and increase controls on one horizontal row. Simulation, balance, replay, and report contracts remain unchanged.

Product `0.87.0`, simulation `55.0.0`, and content `33.0.0` keep Tidal Charge combat numbers unchanged while Hard AI rejects unsafe nonlethal landings using actual contact depth, health, and nearby-opponent pressure. Focused balance reports require both winner and placement evidence for a nerf signal and label winner-heavy, survival-poor results as high variance. Simulation, content, replay, and report contracts remain unchanged.

Product `0.83.0`, simulation `55.0.0`, and content `32.0.0` increase Spirit's skill-damage return, rebalance Force Palm, Meteor Mark, and Tidal Charge, and replace instant support loss with a continuous half-second recovery window. Tidal Charge's ordinary-hit and killing-hit mana rewards are mutually exclusive. The existing eighty-round balance report predates these values and is not current evidence for this candidate.

Product `0.81.0`, simulation `54.0.0`, and content `31.0.0` apply the agreed trait, skill, and item balance follow-up. Tidal Charge kill mana and Frost Field damage healing are driven by the shared skill definitions; the existing 80-round report predates these values and must be regenerated before it is used as current balance evidence.

Product `0.81.1`, simulation `54.0.0`, and content `31.0.0` render starting-attribute summaries, current effects, and next-point deltas with one effect per visual line instead of joining separate values with middle dots.

Product `0.81.2`, simulation `54.0.0`, and content `31.0.0` keep skill and item values in their existing definition registries while presenting costs and targeting as chips and rendering each concrete effect on its own row inside the card.

Product `0.82.0`, simulation `54.0.0`, and content `31.0.0` add renderer-only per-actor walk phases, alternating footstep marks, weight shift, and event-timed skill-cast anticipation and release. Reduced-motion mode suppresses continuous walk and cast motion, and simulation state remains unchanged.

Product `0.79.0`, simulation `52.0.0`, and content `29.0.0` give all sixteen pirate ships independent deterministic firing clocks. Each ship launches every 120 through 180 ticks rather than waiting for a fleet-wide turn, and impact-time coastline updates prevent an airborne shot from exposing deeper land early. Multiple ships and consecutive shots from one ship may remain airborne together.

Product `0.78.0`, simulation `51.0.0`, and content `29.0.0` lower the connected collapse floor from 20% to at most 10% of tick-zero playable land. Integer rounding uses a floor with a one-tile minimum, so the protected core never exceeds the requested ratio. Cannon pacing remains one accepted shot every two seconds rather than forcing 90% removal before the round limit.

Product `0.77.0`, simulation `50.0.0`, and content `29.0.0` fix the public Slow fleet to one launch every 120 ticks and shorten cannon flight from 240 to 185 ticks, approximately 30% faster. Accepted impacts extend the outer-water frontier so later planned targets can remain reachable as the coast erodes.

Product `0.76.1`, simulation `49.0.0`, and content `29.0.0` reject unavailable skills before targeting. Mana and cooldown failures keep the range preview hidden and show the exact mana requirement or remaining cooldown through the live round message.

- Validation source: [../../VALIDATION.md](../../VALIDATION.md)
- Submission package: [../product/05-submission-package.md](../product/05-submission-package.md)
- Asset ledger: [../assets/README.md](../assets/README.md)

Product `0.67.0`, simulation `39.0.0`, and content `25.0.0` increase the shared Grappling Hook cooldown from 600 to 900 ticks, expose its 15-second base reuse time and live remaining cooldown in the HUD, and move the headless scale harness from 50 to the public 60 participants. Unit and replay checks pass. The first corrected fixed-60 profile fails the unchanged simulation p95 gate at `14.143 ms` against `10 ms`; hosted, browser, and release evidence therefore remain pending.

Product `0.67.1`, simulation `39.0.0`, and content `25.0.0` make native hidden state authoritative over shared button display styles. Completed and fatal panels remove and disable the resumable action, while active manual pause restores it. Simulation, replay, and report schemas are unchanged.

Product `0.67.2`, simulation `39.0.0`, and content `25.0.0` preserve generated and procedural terrain colors through cannon warning and critical phases. Separate amber exclamation and red skull markers carry the danger state without replacing the island surface. Simulation, collapse timing, replay, and report schemas are unchanged.

Product `0.68.0`, simulation `40.0.0`, and content `25.0.0` separate boundary-connected outer ocean from enclosed lakes for collapse and artillery planning. Ships sit 1.4 tiles offshore, fire only along a sampled clear-water approach at a current outer-coast tile, target a 210-tick flight, and cannot fire again until 120 ticks after their prior impact. Replay and report schemas remain unchanged, but deterministic fixtures advance to the new simulation envelope.

Product `0.69.0`, simulation `41.0.0`, and content `25.0.0` move manual pause from Shift to `P` and leave Shift unbound. Session-local round statistics accumulate actual path distance, health damage dealt and received, shield-absorbed damage, slowed ticks, and selected-skill use counts from authoritative frames and events. The pause layer renders that live snapshot without changing replay or report schemas; deterministic fixtures advance because `damage-applied` events can now include absorbed damage.

Product `0.70.0`, simulation `42.0.0`, and content `26.0.0` reject Boat use on supported land and automatically consume a charged Boat when its owner enters generated-arena water. Slow collapse and ship reload are paced to reduce cannon clutter without lowering the protected 20% endpoint. Pirate ships follow real outer-coast sectors and remain upright; public island generation bridges diagonal outer-ocean cuts; the renderer adds generated stunned-state feedback, terrain seam overscan, and a slightly closer camera. Replay fixtures require regeneration. Browser, hosted, and human coast/readability proof remain pending.

Product `0.70.1`, simulation `42.0.0`, and content `26.0.0` add bounded arrow-key and pointer-drag spectator panning to eliminated and completed-round views, reset on every new round. Completed results expose `맵 보기`, and `P` restores the result panel. The P panel adds elapsed time, standing count or final rank, eliminations, remaining land, skill hits, item uses, and shove-hit count to its existing movement, damage, block, slow, and skill-use values. Unit, browser, hosted, and physical-input proof must be refreshed for this candidate.

Product `0.71.0`, simulation `43.0.0`, and content `26.0.0` replace multi-tile collapse waves with one warned tile and one cannonball per accepted wave. Sixteen pirate ships divide the accepted coast-target ammunition, attempt the next fleet shot after a deterministic one-to-three-second interval, and retain per-ship flight plus a sixty-tick reload exclusion. A proposal without a clear full-flight assignment is omitted from both warnings and flooding; the 20% core is a floor rather than a 120-second removal target. Replay fixtures require regeneration; browser, pacing, hosted, and human-readable artillery proof remain pending.

Product `0.71.1`, simulation `43.0.0`, and content `26.0.0` complete browser terrain preparation for all sixteen north/east/south/west water-neighbor masks using the accepted cardinal coast art. Opposite shores, three-sided coast cells, isolated remnants, and corners therefore stop borrowing unrelated single-edge frames. Unit, browser, hosted, and human visual proof remain separate gates.

Product `0.71.2`, simulation `43.0.0`, and content `26.0.0` keep deterministic game rules unchanged. Completed results move the outcome and restart/map actions above detailed statistics, omit the developer and control sections, and widen repeated information cards. Active pause retains controls and live data in a responsive layout. Unit, browser, hosted, short-viewport, and human visual proof remain separate gates.

Product `0.72.0`, simulation `44.0.0`, and content `26.0.0` move all sixteen pirate ship centers from 0.9 to 5.25 tiles offshore along the local outer-water direction, leaving roughly 3-4 visible water tiles between hull and shore. The camera ocean margin grows to 7.25 tiles. Ship origins and target assignments change deterministic state, so replay fixtures and browser evidence must be refreshed.

Product `0.72.1`, simulation `45.0.0`, and content `26.0.0` synchronize every accepted tile warning with its cannon launch tick. Danger, impact, and flooding timing remain unchanged. Replay fixtures must be regenerated because tile state and event timing change.

Product `0.72.2`, simulation `45.0.0`, and content `27.0.0` replace the procedural treasure-ship presentation with an accepted transparent teal-and-gold merchant-vessel sprite while retaining the old geometry as a load-failure fallback. Delivery rules remain unchanged. Replay fixtures refresh for the content version; browser and hosted visual proof remain pending.

Product `0.73.0`, simulation `46.0.0`, and content `27.0.0` start every participant at 30 current mana while retaining attribute-derived maximum mana and existing regeneration. Opening bot skill bursts and deterministic outcomes change, so replay fixtures and balance evidence must be refreshed. Browser, hosted, performance, and human pacing proof remain pending.

Product `0.74.0`, simulation `47.0.0`, and content `27.0.0` rebalance the six linear starting attributes after an 80-round, 60-participant focused-build audit. Strength grants 3.25% outgoing power per point, Agility grants 3% movement, 4% cooldown reduction, and 1% mana-cost reduction, Constitution grants 4 health and 2.5% health regeneration, Balance grants 4% impulse resistance and 3% control-duration reduction, and Willpower grants 1.5% damage reduction and shield strength. Spirit remains unchanged. Skill commits, bot affordability checks, the action HUD, settings projections, deterministic replay fixtures, and balance evidence all consume the same attribute rules.

Product `0.76.0`, simulation `49.0.0`, and content `29.0.0` apply the next deterministic balance pass. Agility grants 2.5% movement and 2% shorter stumble per point, Constitution grants 2 health and 1.5% health regeneration, and Spirit adds 0.5% skill damage per point. Arc Bolt cools down for 7 seconds, Force Palm for 2 seconds, Chain Bind reaches 4.75 tiles, and Tidal Charge deals 26 damage. Boat support lasts 2 seconds, Brick Bag heals 10, and Soap deals 20 ordinary mitigated damage after its stumble completes. All card copy remains derived from these shared definitions.

Product `0.20.0`, simulation `6.0.0`, and content `4.0.0` introduce starting loadouts, larger arenas, hand-reach shove physics, credited-elimination stat growth, and local debug tuning. Local unit, browser, focused strategy, headless scale, and production Chrome profiles pass. The legacy full controlled round audit timed out twice and hosted proof for this exact candidate remains pending; older hosted SHA evidence does not prove these rules.

Product `0.21.0` renames the public game to `바닥이 사라지는 술래잡기`, removes decorative masthead and section copy, and adds arrow-key, mouse-drag, virtual-joystick, and standard-gamepad input adapters without changing simulation `6.0.0` or content `4.0.0`. The collapsed `data-development-only` telemetry panel is a release blocker: remove it or gate it behind `import.meta.env.DEV` before the contest candidate is captured.

Product `0.22.0` and simulation `7.0.0` add seeded connected island coastlines, enclosed lakes, larger preset bounds, shoreline-aware bots and items, and a connected 20% collapse floor. Content remains `4.0.0`. Replay fixtures must be regenerated and the round, scale, browser, and hosted checks refreshed for the exact candidate SHA; evidence from the rectangular `0.21.0` map does not transfer.

Product `0.23.0` and simulation `8.0.0` split the entry flow into menu, saved settings, and gameplay screens; remove the setup-map preview; add a player-follow camera; and expand the 8/16/24/32 bounds to `22×17`, `25×20`, `28×23`, and `31×26`. Coast seeds vary shape while preserving a fixed pre-lake land budget, so every larger preset has strictly more playable land even when its seed differs. Content remains `4.0.0`.

Product `0.24.0` changes only PixiJS presentation: the local camera now renders a fixed 58-degree elevation with projected tile depth, bounded southern cliff fronts, upright participant shadows, projected action vectors, and Y-depth ordering. Simulation stays `8.0.0`, content stays `4.0.0`, and replay hashes are unchanged apart from the recorded product envelope. Exact-SHA Chrome smoke and hosted Pages evidence must be refreshed before this visual candidate replaces `0.23.0`.

Product `0.25.0` adds a no-network version-history screen to the main menu. Six concise records explain why the `0.20.0`–`0.25.0` milestones happened and what changed, while `Escape`, `메뉴로`, skip-link routing, and launcher-focus restoration preserve the existing keyboard contract. Simulation stays `8.0.0`, content stays `4.0.0`, and replay hashes remain unchanged apart from the product-version envelope. Exact-SHA Chrome smoke and hosted Pages evidence must be refreshed before this candidate replaces `0.24.0`.

Product `0.26.0` fixes public play at 50 participants and Hard AI, replaces categorical mass with a 50–100 starting-weight slider, expands the island to `44×36`, and attempts five bounded lakes. Simulation advances to `9.0.0`, content to `5.0.0`, and local playtest reports to v4. The local production artifact passes all eight Chrome smoke paths; the fixed-seed 50-participant browser profile reports p95 `16.8 ms`, zero backlog, and a `2,848,504`-byte forced-GC heap delta after 20 restarts. Hosted exact-SHA Pages and public-URL smoke remain pending for this candidate.

Product `0.27.0` adds human Wind Blast activation, Q/E and gamepad/DOM slot bridges, launch-speed swept contact, strength-based elimination credit, and replay format v2 with required human mass/loadout setup. Simulation advances to `10.0.0`; content stays `5.0.0`; report schema stays v4. Local merge checks, eight production smoke paths, the fixed-50 headless profile, and the fixed-50 Chrome profile pass. Hosted CI, Pages, and public-URL evidence must still be refreshed at the final `0.27.0` SHA before promotion.

Product `0.28.0` adds human Brick Bag activation, deterministic same-tick placement priority, static-wall body and attack blocking, collapse-driven wall removal, and depth-sorted procedural wall presentation. Simulation advances to `11.0.0`; content, replay, and report schemas stay unchanged. Local merge checks and eight production smoke paths pass. Wall-active fixed-50 profiles pass at headless simulation p95 `2.525 ms` and local Chrome frame p95 `18.5 ms` with zero backlog. GitHub Actions run `30022962614` validated and deployed implementation SHA `19b35261e3516b5cec572952c5228ccf2a856e28`; a fresh public Chrome session confirmed `v0.28.0`, the Brick Bag setting, WebGL canvas initialization, and a running 50-participant arena without warning or error logs.

Product `0.29.0` adds human Boat activation, an exact 300-tick effect, bounded support across in-arena Void tiles, procedural hull and activation feedback, remaining-duration HUD, and the sixth offered loadout card. Simulation advances to `12.0.0`, content to `6.0.0`; replay v2 and report v4 remain sufficient. Merge checks pass with 139 tests, and all eight production-artifact Chrome smoke paths pass. Brick-plus-Boat fixed-50 profiles pass at headless simulation p95 `4.351 ms` and local Chrome frame p95 `18.5 ms` with zero backlog. GitHub Actions run `30025468513` validated and deployed exact implementation SHA `d32e66711d87db21fc0b2d4adf1261d2cd52d9e0`; a fresh public session confirmed `v0.29.0` and the Boat setting at `https://0disoft.github.io/shovefall/`.

Product `0.30.0` adds human Bomb placement, two charges, a visible exact 300-tick fuse, deterministic three-tile radial falloff, owner vulnerability, same-tick Dodge, flood and owner-death persistence, canonical hashed Bomb state, procedural warning/detonation feedback, and the seventh offered loadout card. Simulation advances to `13.0.0`, content to `7.0.0`; replay v2 and report v4 remain sufficient. The local suite passes 146 tests. Brick-plus-two-Bomb fixed-50 headless simulation passes at p95 `4.867 ms`; the local Chrome profile completes a visible fuse and detonation at frame p95 `18.5 ms` with zero backlog. [CI run 30030306125](https://github.com/0disoft/shovefall/actions/runs/30030306125) validated and deployed exact SHA `9b82be027846192464aff861ec7e7dd86e86cd19`; a fresh public session confirmed `v0.30.0`, the Bomb card, and no console warnings or errors.

Product `0.31.0` adds human Soap placement, three charges, deterministic actor-ID occupancy, one-use post-contact triggering, bounded `0.105..0.42` slip speed, 24-tick Stumbling, owner vulnerability, external-credit preservation on self-trigger, Void removal, canonical hashed Soap state, procedural grooves/bubbles, and the eighth offered loadout card. Simulation advances to `14.0.0`, content to `8.0.0`; replay v2 and report v4 remain sufficient. The local suite passes 160 tests and all twelve production-artifact Chrome paths. The fixed-50 Brick/two-Bomb/Soap profile passes at simulation p95 `6.265 ms`, zero 100 ms steps, and `2.35×` real time while observing three Soap patches and five triggers. The current-renderer production-Chrome rerun passes at frame p95 `18.4 ms`, maximum `18.8 ms`, zero backlog, and zero frames above 100 ms after one retained host-contended failure; Soap's live presentation is covered by the production-safe smoke rather than a dedicated frame window. [CI run 30033824900](https://github.com/0disoft/shovefall/actions/runs/30033824900) validated, uploaded, and deployed exact implementation SHA `50ec3c1a6c6e3d2dfb46987b5ab55f6a67f7666e`. A fresh public browser session confirmed `v0.31.0`, the Soap card, a running 50-participant WebGL arena, and no browser log entries.

Product `0.32.0` adds the human-only static-anchor Grappling Hook as the ninth offered loadout card with two charges, 4.5-tile range, 1.25-tile minimum, deterministic tile/Brick acquisition, mass-sensitive `0.24 / massFactor` self-pull capped at `0.30`, and 12-tick `GrapplePull` drag. Simulation advances to `15.0.0`, content to `9.0.0`; replay v2 and report v4 remain sufficient. The local suite passes 169 tests and all thirteen production-artifact Chrome paths. Its fixed-50 headless profile exercises both Hook charges and passes at simulation p95 `5.123 ms`, zero 100 ms steps, and `3.69×` real time. The latest production-Chrome performance sample is rejected because total workstation CPU stayed `81.6–94.2%` and both the Brick/Bomb baseline and Hook/Bomb case failed almost identically; its ceiling remains unchanged. [CI run 30038218455](https://github.com/0disoft/shovefall/actions/runs/30038218455) validated, uploaded, and deployed exact implementation SHA `4dc23456673d08ba15228776bdce15e2b768bcd5`. A fresh cache-busted public session confirmed `v0.32.0`, the Hook setting, an active Hard-AI WebGL arena with changing survivor state, and no browser log entries. The `0.31.0` run and SHA above remain exact historical proof.

Product `0.32.1` removes the developer telemetry markup from static public HTML and creates it only in DEV. Production no longer creates or updates tick, rate, position, seed, or state-hash outputs; bounded browser checks use existing scheduler and renderer observability instead. Clipboard failure copy no longer tells players to read removed values. Simulation remains `15.0.0`, content remains `9.0.0`, replay remains v2, and report v4 remains sufficient. Local aggregate validation passes 169 tests, DEV smoke passes fourteen paths, production smoke passes thirteen paths, and the public HTML contract rejects any reintroduced developer output ID. Exact-SHA hosted validation, Pages deployment, and public smoke remain pending for this patch candidate.

Product `0.33.0` and simulation `16.0.0` widen the public island to 48×40, require exactly eight separated 6–10-tile lakes under a 72-tile total budget, and preserve a connected 20% collapse floor. Item placement now selects edge, near-edge, or interior at a topology-independent 3:2:1 ratio before choosing a tile. Content remains `9.0.0`, replay remains v2, and reports remain v4. The local suite passes 170 tests, fourteen DEV Chrome paths, and thirteen production-artifact Chrome paths. The fixed-50 headless profile passes at simulation p95 `6.823 ms`, no 100 ms step, and `1.73×` real time. [CI run 30043768628](https://github.com/0disoft/shovefall/actions/runs/30043768628) validated, uploaded, and deployed exact implementation SHA `732f95f3a777220d0410612a2fb95840a8e7e721`; `Validate` completed in 3 minutes 49 seconds and the dependent Pages job in 10 seconds. A fresh cache-busted public session confirmed `v0.33.0`, the widened-island version record, a running 50-participant WebGL arena, zero developer-panel nodes, and no browser warnings or errors. The full round audit exceeded its configured 300-second limit without a result. A fresh CPU preflight observed `67.6%` average and `96.4%` maximum host CPU, so no `0.33.0` browser-performance claim was attempted.

Product `0.34.0`, simulation `17.0.0`, and content `10.0.0` add protected-core pressure and narrow mass/item extremes while retaining replay v2 and report v4. The local suite passes 173 product tests, thirteen production-artifact Chrome paths, and the sharded production, mass, selectable-item, and collapse-speed audits. [CI run 30055148110](https://github.com/0disoft/shovefall/actions/runs/30055148110) validated, uploaded, and deployed exact runtime SHA `c0ddda93e1d75520909c79888c342f4b57747d7f`; all thirteen hosted production Chrome paths and the dependent Pages deployment succeeded. A fresh cache-busted public session confirmed `v0.34.0`, an active 50-participant Hard-AI WebGL arena, changing tick and survivor state, one canvas, and no browser warnings or errors.

Product `0.34.1` removes the local tuning lab and `DEBUG` marker from production settings while retaining the tool in DEV. Simulation stays `17.0.0`, content stays `10.0.0`, replay remains v2, reports remain v4, and replay hashes are unchanged. The local suite passes 179 tests, fourteen DEV Chrome paths, thirteen production-artifact Chrome paths, and an exact-HEAD submission capture. [CI run 30061893140](https://github.com/0disoft/shovefall/actions/runs/30061893140) validated, captured, uploaded, and deployed exact runtime SHA `354a602392cccb453ebb1a4ac1fd52c5a39fac6c`; a fresh cache-busted public session confirmed `v0.34.1`, zero debug-tuning nodes or labels, and no browser warnings or errors.

Product `0.35.0`, simulation `18.0.0`, and content `11.0.0` replace delayed locomotion and protected-core pressure with immediate movement, stronger hand-shove commitment, saved automatic growth planning, Brick dodge mounting, direct-kill Bombs, exact-ammunition pirate cannon collapse, and lethal land-preserving rock pressure. Reports advance to v5, replay fixtures are regenerated under the new simulation envelope, and replay remains v2. Unit/scenario validation passes 182 tests; browser, deterministic audit, performance, capture, hosted CI, Pages, and public functional evidence must be refreshed before promotion.

Product `0.36.0` keeps simulation `18.0.0` and advances content to `12.0.0`. Forty-nine public bots receive a seed-derived balanced passive-plus-active loadout, then request charged items through the existing command contract after delayed perception, context-specific utility checks, and a deterministic decision cooldown. Bomb users retain a two-second escape intent and stop planting new Bombs below ten survivors. Generated character motion, placed Bomb and Soap props, Boat presentation, and bounded camera kick remain presentation-only. Formatting, lint, TypeScript, 187 unit/scenario checks, and all thirteen production Chrome paths pass. Production audit shard zero passes eight fixed 50-participant seeds with no time-limit or no-survivor result, `43.050..56.617` second duration, 365 active uses, and nine Bomb-owner deaths across 29 Bomb uses. Shard one, merged strategy gates, profile, capture, hosted CI, Pages, and public functional evidence remain promotion gates.

Product `0.37.0` advances simulation to `19.0.0` and content to `13.0.0`. A Bomb owner survives the direct-kill portion of that owner's blast but receives a strong outward launch and 42-tick stumble before any same-tick new item command. Opponents remain directly eliminated. A new sixteen-frame true-alpha terrain atlas adds grass, sand, cardinal coast, corner, water, and warning art over the procedural fallback; camera-space culling keeps the live terrain-sprite set below 500 in the production smoke viewport. Replay fixtures regenerate because Bomb outcomes change. The merged sixteen-seed production audit reports a `50.215` second mean, no time-limit result, `83.57%` of item spawns in the outer two risk bands, and zero Bomb-owner direct self-deaths across 58 uses. [CI run 30087368621](https://github.com/0disoft/shovefall/actions/runs/30087368621) validated and deployed exact SHA `7386349b43a6e83bd0071873184f70e303c92ef0`; optional media capture did not produce promoted evidence.

Product `0.38.0` keeps simulation `19.0.0` and content `13.0.0`. It adds presentation-only windup fans, hand trajectories, dodge wedges, velocity trails, and falling rings in a dedicated overlay above character sprites. Public-scale detail is limited to the human and actors within eight world units; distant bots retain one cheap direction cue. Reduced-motion keeps static information shapes. Replay fixtures refresh only for the product envelope; deterministic hashes and rules remain unchanged. All 194 unit/scenario checks and thirteen production Chrome paths pass locally.

Product `0.39.1`, simulation `20.0.0`, and content `14.0.0` preserve the Slow-collapse 50-player rules, including 12 separated 5–9-tile lakes under the 96-tile budget, and fix keyboard movement held during the countdown. The application remembers movement through the transition but still rejects pre-start shove, dodge, and item edges; reports advance to v6 for the current public rules. Replay remains v2 because simulation state and hashes are unchanged. All 195 unit/scenario checks, fourteen development Chrome paths, and thirteen production-artifact Chrome paths pass locally. Strategy audit, host-qualified profile, capture, hosted CI, Pages, and public URL evidence remain gates for this candidate.

Product `0.41.0`, simulation `21.0.0`, and content `15.0.0` include solid deterministic trees, mass-scaled 1.5–3-tile Dodge, swept Soap crossings, one-airborne-shot-per-ship scheduling, immediate bot escape from lethal rocks, and a browser-local 50-round scoreboard. Presentation adds atlas-derived ocean, rectangular surface crops, generated trees, effective percentage HUD values, and 70% master audio gain. Replay remains v2 but fixtures regenerate for the product envelope and prior deterministic state changes. Grouped local, production browser, audit, profile, capture, hosted CI, Pages, and public URL evidence are pending for this candidate.

Product `0.42.0`, simulation `22.0.0`, and content `16.0.0` separate movement from combat: arrows/pointer/gamepad own movement, three selected reusable skills use `Q/W/E`, and two charged inventory slots use `D/F`. Setup chooses one starting item and map pickups fill empty or depleted stable slots. Kill rewards pause for a prerequisite-gated stat/skill tree. Reports advance to v7; replay stays v2 with optional starting-skill compatibility and regenerated deterministic fixtures. Grouped local, production browser, balance audit, profile, capture, hosted CI, Pages, and public URL evidence are pending for this candidate.

Product `0.43.0`, simulation `23.0.0`, and content `17.0.0` add health and mana, regeneration, shields, deterministic control state, and nine inventory-independent combat skills. Bots receive varied three-skill loadouts and use the same readiness and mana rules. Vitality, Focus, and selected-skill scaling extend the kill-reward tree. Public Slow artillery begins during the opening seconds and spreads waves every 42 ticks. Reports advance to v8 with final human combat state; replay remains v2 with regenerated deterministic fixtures. Grouped local, production browser, combat balance, profile, capture, hosted CI, Pages, and public URL evidence are pending for this candidate.

Product `0.44.0` and simulation `24.0.0` replace immediate scheduled item materialization with one visible 72-tick treasure gift. A tick-derived offshore ship orbit, nearby candidate restriction after the existing 3:2:1 risk-band draw, one-flight limit, impact revalidation, reserved item IDs, and active-delivery hashing keep the sequence deterministic and bounded. Content remains `17.0.0`, reports remain v8, replay remains v2, and fixtures regenerate. Grouped local, production browser, treasure-delivery readability, balance, profile, capture, hosted CI, Pages, and public URL evidence are pending for this candidate.

Product `0.44.0`, simulation `24.0.0`, and content `17.0.0` were the prior treasure-delivery contract.

Product `0.45.0`, simulation `25.0.0`, and content `17.0.0` replace total-spent skill gating with a three-branch progression graph. Root and branch levels gate matching `Q/W/E` ranks, while rank three requires cross-branch skill investment. The DOM renders nine keyboard-selectable nodes, explicit prerequisite text, persistent ranks, and decorative connection state without owning eligibility. Vitality and Focus become valid normalized commands, and ambiguous dual upgrades fail closed. Reports and replay format remain v8 and v2; deterministic fixtures regenerate. Grouped local, production browser, path-balance, narrow-viewport, capture, hosted CI, Pages, and public URL evidence are pending.

Product `0.46.0`, simulation `26.0.0`, and content `17.0.0` replace the starting-weight slider with an exact 20-point five-attribute build. Replay advances to v3 and local reports to v9.

Product `0.47.0`, simulation `26.0.0`, and content `17.0.0` remove every preselected starting attribute, skill, and item from the browser. Settings remain invalid until all 20 points, three skills, and one item are chosen. Starting without a saved valid setup opens an accessible modal and routes directly to settings. Hosted exact-SHA proof remains pending.

Product `0.48.0`, simulation `26.0.0`, and content `17.0.0` split setup into four accessible tabs and expose current derived combat values plus each attribute's next-point delta. The Lab tab remains development-only. The simulation, replay, and report contracts do not change.

Product `0.49.0`, simulation `27.0.0`, and content `17.0.0` add Willpower as the sixth starting attribute, remove the four-point neutral threshold, and open every attribute to the full 20-point budget with linear per-point effects. Willpower reduces health damage and increases shields. The six setup cards use a two-column, three-row desktop layout with a narrow-screen fallback. Replay remains v3 and reports remain v9, while deterministic fixtures require regeneration for the expanded hashed setup contract.

Product `0.50.0`, simulation `28.0.0`, and content `18.0.0` add the same bounded forward-cone assistance to Wind Blast and Arc Bolt while retaining wall/tree occlusion on the assisted path. Settings add nine repository-owned skill icons, complete combat details, and vertical attribute steppers. Replay remains v3 and reports remain v9; deterministic fixtures require regeneration because assisted targeting changes simulation outcomes.

Product `0.51.0` and simulation `29.0.0` make Hard bots sample their complete Dodge path before committing, preserve skill knockback through Stumbling actions, and add an Arc Bolt impact trail. Content remains `18.0.0`, replay remains v3, and reports remain v9. Deterministic fixtures require regeneration because bot commands and skill displacement change outcomes.

Product `0.58.0`, simulation `33.0.0`, and content `21.0.0` define the current local candidate. The Boat card now exposes the already-enforced boarding restrictions: skills and items cannot be used, and health and mana regeneration stop during its four-second water traversal. Replay remains v3 and reports remain v9; deterministic fixtures advance to the new version envelope.

Product `0.59.0`, simulation `33.0.0`, and content `21.0.0` replace the player-facing `1.00×` mass multiplier with a weight-adjustment label. Neutral reads `기본`; Strength investment reports its percentage above baseline while the deterministic simulation value remains unchanged. Replay remains v3 and reports remain v9; deterministic fixtures advance only for the product-version envelope.

Product `0.60.0`, simulation `33.0.0`, and content `21.0.0` make aiming input-complete without a pointer. `Q/W/D` enter aim, arrows move the target while ordinary movement is held at zero, the same action key or Enter confirms, and Escape cancels. Pointer confirmation remains available, self-target actions bypass aim, and movement input cancels an out-of-range approach. Replay remains v3 and reports remain v9; deterministic fixtures advance only for the product-version envelope.

Product `0.61.0`, simulation `34.0.0`, and content `22.0.0` align the fixed 60-participant browser mode with bot-loadout, replay, and scoreboard boundaries, fixing the startup exception that previously left the renderer before its first frame. Skill and item balance fields now drive both descriptions and default runtime tuning. Brick Bag gains two-tile placement and 20 healing on each accepted wall; Soap gains three-tile placement. Replay remains v3 and reports remain v9; deterministic fixtures require regeneration.

Product `0.61.1`, simulation `34.0.0`, and content `22.0.0` remove the always-visible fixed-seed warning, build metadata, and summary-card preamble from the local balance dashboard so comparison results begin immediately below the page header. A short inline error remains hidden unless the snapshot cannot be parsed. Replay stays v3 and reports stay v9.

Product `0.62.0`, simulation `34.0.0`, and content `22.0.0` add nine separately generated skill-effect sprites without changing combat rules. Directional art rotates with projected vectors, persistent zone and shield sprites follow authoritative simulation state, and the prior Graphics geometry remains the optional-asset fallback. Replay stays v3 and reports stay v9; fixtures advance only for the product-version envelope.

Product `0.63.0`, simulation `35.0.0`, and content `23.0.0` replace the public `E` shove with a cooldown-based Grappling Hook shared by every participant and remove Hook from the item catalog. Bomb and Soap owner exceptions, Arc Bolt cooldown and impulse, Spring Glove Hook enhancement, command fields, cooldown state, HUD, bot decisions, and targeting adapters advance together. Replay advances to v4 and deterministic fixtures must be regenerated; reports stay v9.

Product `0.63.1`, simulation `35.0.0`, and content `23.0.0` keep replay v4 and report v9. Item labels move into the item definition SSOT; targeting construction and action HUD state become pure application modules with direct tests. Runtime order and public behavior do not change.

Product `0.64.0`, simulation `36.0.0`, and content `24.0.0` remove Stone Prison and the barrier-zone rule from the public catalog, bots, simulation, and presentation. Replay advances to v5 because old setup payloads may name the retired skill. The focused balance audit rotates all 28 remaining two-skill combinations and five starting items through eighty balanced-build 60-participant rounds; reports stay v9.

Product `0.65.0`, simulation `37.0.0`, and content `25.0.0` rebalance Force Palm, Chain Bind, Frost Field, Aegis, and Wind Blast from that focused audit and widen Hard-bot Brick Bag use under readable pressure. Skill and item cards continue to derive values from their runtime definitions. Replay stays v5 with regenerated deterministic fixtures; reports stay v9.

Product `0.66.0`, simulation `38.0.0`, and content `25.0.0` add obstacle-aware bot detours, blocked-path Dodge and emergency checks, stalled-progress recovery, target commitment, reachable-item selection, and contextual skill utility with obstacle visibility. The terrain cache and bounded 384-expansion search keep the 60-participant path inside the existing deterministic command boundary. Replay and reports remain v5 and v9; fixtures regenerate for the new version envelope.

The browser profile rejects a host above its five-sample CPU qualification before Chrome starts. Contest-release promotion still requires `0.62.0` production Chrome, strategy audit, hosted proof, a passing host-qualified 60-participant production-browser profile, combat/item/tree-path, assisted-aim, bot-dodge balance evidence, simultaneous skill-VFX readability, treasure-delivery readability, short-viewport pause/trait-choice proof, and human playtest.

## Release Types

- `local candidate`: a clean exact SHA with configured local checks and browser evidence.
- `hosted candidate`: the same SHA built by hosted CI and served at a temporary or final HTTPS URL.
- `contest release`: a hosted candidate with human-play, visual, asset, capture, and submission
  evidence complete.

Calling a build a candidate does not publish it. Calling a URL deployed does not prove that it
serves the intended SHA.

## GitHub Pages Target

- Repository: `https://github.com/0disoft/shovefall`
- Public URL: `https://0disoft.github.io/shovefall/`
- Publishing source: GitHub Actions from `.github/workflows/ci.yml`
- Source branch: `main`
- Build output: `dist`
- Base-path contract: relative Vite asset URLs from `base: "./"`; the project site lives under
  `/shovefall/` without a provider-specific rebuild.
- Credential model: no repository secret or long-lived deploy token. The deploy job receives only
  `contents: read`, `pages: write`, and short-lived OIDC `id-token: write` permissions.
- Artifact identity: the `dist` directory tested by `smoke-dist` in the `Validate` job is uploaded
  once and consumed by the dependent `Deploy GitHub Pages` job. The Pages artifact is retained for
  30 days for incident evidence.

## Candidate Freeze

1. Record the full commit SHA, product/simulation/content versions, and intended host.
2. Confirm the child repository is clean and the remote branch resolves to the same SHA.
3. Run configured `shovefall_check`, `shovefall_smoke_dist`, `shovefall_audit_rounds`,
   `shovefall_profile_scale`, `shovefall_profile_browser`, and
   `ssealed_shovefall_doctor_strict` intents against that SHA.
4. Run `shovefall_capture_submission` from the clean exact-HEAD worktree, or inspect the matching
   successful `main` CI artifact. Confirm `manifest.json`, both PNG hashes, the WebM hash, and empty
   browser-error arrays before using the media in the contest post.
5. Confirm replay fixtures and evidence documents name the current versions.
6. Freeze game rules and content. A later behavior, content, asset, or build change creates a new
   candidate and invalidates affected evidence.

## External Gates

Before deployment or contest submission, record all of the following:

- GitHub Actions workflow URL and conclusion for the exact candidate SHA.
- Branch-protection or manual-promotion decision; a workflow file alone is not enforcement.
- GitHub Pages deployment URL and environment result for the exact candidate SHA.
- Named device, OS, browser/version, viewport, and critical-journey result.
- Human playtest batch and decision from
  [../product/04-playtest-protocol.md](../product/04-playtest-protocol.md).
- Approved visual direction and every shipped asset row from [../assets/README.md](../assets/README.md).

## Deployment Boundary

Pushes to `main` and manual workflow dispatches run validation before deployment. Pull requests
cannot upload or deploy the Pages artifact. GitHub Pages is the only selected production host; the
workflow does not contain a provider token, package publication, release creation, database action,
or runtime secret. A successful `Validate` job is necessary but insufficient: promotion is complete
only when the dependent `Deploy GitHub Pages` job succeeds and the final HTTPS checks below pass.

The first source push after enabling Pages is the initial deployment. Do not call the public link
ready until its workflow run, `github-pages` environment deployment, URL content, and critical
journey are observed at the same candidate SHA.

## Current Deployment Evidence

On 2026-07-23, [CI #12](https://github.com/0disoft/shovefall/actions/runs/29979359647)
validated and deployed exact commit `7794e9a47f89aefea1f39483680996a5236963ae`. The `Validate`
job completed in 34 seconds, the dependent `Deploy GitHub Pages` job completed in 10 seconds, and
the retained `github-pages` artifact reported digest
`sha256:e3031183663b44eb4285a5499ee4e953dae6ee25e7daa8953fbd438b2a7d27ef`.

The public URL loaded in Chrome with WebGL ready and no captured console log entries. An 8-player,
Easy, Slow round reached active play; a held `D` input changed the reported position from
`2.77, 4.24` to `3.66, 4.24`, and Space produced the visible `Stumbling` action state. This is
deployment and critical-path browser evidence, not human fun, balance, physical-device matrix, or
cross-browser evidence.

On 2026-07-24, [CI run 30056501932](https://github.com/0disoft/shovefall/actions/runs/30056501932) validated repository SHA `fc347488e2446d16dd52e341b4dd6ab28d1c8aab`, exercised thirteen production Chrome paths, and deployed the unchanged `0.34.0` application bundle. A cache-busted Pages session saved the fixed-50 Hard-AI setup with Bomb and Grappling Hook, entered active play, produced the missed-shove feedback, spent Hook and Bomb from two charges to one with their dedicated feedback, and reported no browser warning or error. Browser-automation backlog contaminated the attempted live movement/dodge observation, and screenshot capture timed out twice, so neither is promoted as current manual evidence.

Later on 2026-07-24, [CI run 30087368621](https://github.com/0disoft/shovefall/actions/runs/30087368621) validated exact `0.37.0` SHA `7386349b43a6e83bd0071873184f70e303c92ef0`, exercised thirteen production Chrome paths, uploaded the tested Pages artifact, and completed the dependent deployment. Optional exact-SHA media capture remained a visible non-blocking warning and produced no promoted capture bundle. A cache-busted public request returned HTTP 200 with the current application script. This proves hosted validation and delivery for `0.37.0`, not physical-device behavior, human readability, or the local `0.38.0` presentation candidate.

## Post-deploy Verification

Against the final HTTPS URL and candidate SHA:

1. Hard refresh and verify the title, setup, and canvas render without console-fatal errors.
2. Run `게임 시작` through countdown, movement, shove, dodge, collapse, result, and restart.
3. Verify `기록 복사` succeeds in the secure context and denial leaves visible failure and retry guidance.
4. Test one fixed 50-participant Slow round with eight initial map items, four-second respawns, and the 120-second limit. Internal Normal and Fast fixtures remain diagnostics, not public settings.
5. Confirm optional audio can fail without blocking play.
6. Inspect network activity for unexpected origins, runtime API calls, mixed content, and missing
   assets.
7. Capture the final screenshot/video only after this verification and record their source SHA.

## Stop Conditions

Stop promotion when any required check is missing, stale, pending, or tied to another SHA; when the
Pages deployment is cancelled or superseded; when the public artifact cannot be tied to the
candidate; when a critical journey fails; or when an asset has unknown provenance. Follow
[rollback.md](rollback.md) after a published regression.
