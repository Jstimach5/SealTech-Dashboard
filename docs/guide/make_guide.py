"""SealTech production board guide. Run inside the guide folder after make_assets.py."""
import os
from render import Guide, chip

OUT = 'out/SealTech_Production_Board_Guide.pdf'
os.makedirs('out', exist_ok=True)
g = Guide('assets/board', 'SealTech Insulation · Production board guide · v1.0 · Oct 2026')
S, M, img, row, col, note = g.steps, g.must, g.img, g.row, g.col, g.note

g.extra_css = """
table.rs { border-collapse: collapse; width: 100% }
table.rs th { text-align: left; font-size: 9pt; color: #6b7280; letter-spacing: .07em; padding: 0 8px 4px }
table.rs td { font-size: 11pt; padding: 5px 8px; border-top: 1px solid #e5e7eb; vertical-align: top; line-height: 1.22 }
table.rs td:first-child { font-weight: 800; white-space: nowrap }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; font-size: 12pt; line-height: 1.25 }
.kv b { white-space: nowrap }
.box { border: 2px solid #e5e7eb; border-radius: 10px; padding: 10px 14px }
.box .who { margin-bottom: 6px }
.flow { display: flex; align-items: center; gap: 10px; font-size: 12.5pt; font-weight: 700 }
.flow .n { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 12px; text-align: center; line-height: 1.2 }
.flow .n small { display: block; font-weight: 500; font-size: 10pt; color: #4b5563 }
.flow .a { color: #1f5ce6; font-size: 20pt; font-weight: 900 }
"""

# 1. Cover --------------------------------------------------------------------------------------
PATHS = [
    (1, 'Run the 7:00 huddle', 'The wall fills itself; read it top to bottom', 'TODAY', 'LEAD'),
    (2, 'Clear what can’t be invoiced', 'A finished job lands in Requires invoicing', 'CANNOT INVOICE', 'OFFICE'),
    (3, 'Review a finished job', 'Overnight photo check, then 1st and 2nd pass', 'REVIEW 🔒', 'OFFICE'),
    (4, 'Acknowledge a Problem', 'A crew answers Problem in Jobber', 'TODAY · ACK', 'LEAD'),
    (5, 'Focus, responder, flags', 'The office sets the day and logs issues', 'REVIEW 🔒 · TOOLS', 'OWNER'),
    (6, 'Monday scorecard', 'Seven numbers by week, office only', 'SCORECARD 🔒', 'OWNER'),
    (7, 'Keep it running and grow it', 'Stale data, updates, what comes next', 'OFFICE PC · GITHUB', 'OWNER'),
]
g.cover_paths('Production board', 'What the office wall shows, who acts on it, and how to keep it running', PATHS,
              'Wall: <b>office PC › Chrome kiosk › localhost:8787</b>  ·  Trial: <b>npm run demo</b> on the laptop  ·  '
              'Code: <b>GitHub › Jstimach5/SealTech-Dashboard</b>', cols=4)

# 2. What we built ------------------------------------------------------------------------------
flow = ('<div class="flow"><div class="n">Jobber<small>jobs · visits · notes</small></div><span class="a">+</span>'
        '<div class="n">Photo Review Queue<small>verdict rows</small></div><span class="a">→</span>'
        '<div class="n">Board service<small>office PC · every minute</small></div><span class="a">→</span>'
        '<div class="n">The wall<small>55" panel · laptop · phone</small></div></div>')
built = g.tasks(None, [
    'TODAY wall: crew lanes, NEEDS ATTENTION, CANNOT INVOICE count and lines, Jobber’s bucket counts',
    'STAGES, CANNOT INVOICE list, REVIEW and SCORECARD screens, PIN per person',
    'READY / FIX / HOLD verdicts, Problem ACK, focus line, responder, issue flags, owner changes',
    'Runs on the office PC as a Windows service; the panel is a Chrome kiosk',
    'Checked by 794 rule and service tests and 112 screen tests at wall and laptop size',
], title='BUILT AND WORKING (ON TESTVILLE PRACTICE DATA)')
never = g.tasks(None, [
    'Dollars, street addresses or phone numbers',
    'Incidents, or a name beside a quality number',
    'Anything typed only into the board: answers live in Jobber, verdicts and flags in the sheets',
], title='THE WALL NEVER SHOWS')
waits = g.tasks(None, [
    '<b>Live Jobber jobs</b>: needs the Jobber developer app (page 16)',
    '<b>Google Sheets</b>: verdicts and flags save on the office PC until the sheets are connected',
    '<b>ACK and crew recap into Jobber notes</b>: shown as <b>queued</b> until Jobber writes are on',
    '<b>The 15-minute text to the owner</b>: logged on the office PC until email sending is set up',
], title='NOT LIVE YET')
g.page('<div class="ptitle">What we built</div><div class="q">ONE SCREEN FOR THE QUESTION: WHERE ARE THE CREWS, AND WHAT CAN’T WE BILL YET?</div>'
       + flow + row(col(built, flex=1.15), col(never, waits, flex=1)))

# 3. Rules --------------------------------------------------------------------------------------
g.rules_page('Rules that keep the wall true', [
    ('LEAD', 'ANSWER VISIT RESULT IN JOBBER', 'Before you leave the job. Not answered: UNANSWERED goes up and the card shows no result.', 'r_unans', 1.45),
    ('OFFICE', 'ACK A PROBLEM WITHIN 15 MIN', 'Late: red border on the card and one text to the owner.', 'r_ack', 0.95),
    ('REV1', 'VERDICT BY 16:30 · 2ND PASS BY 17:00', 'Late: the job ages on the rail another day.', 'r_verd', 2.1),
    ('LEAD', 'FIX BY END OF NEXT BUSINESS DAY', 'Open: the line turns amber at 3 days, red at 7.', 'r_fix', 2.4),
    ('OFFICE', 'CLOSE THE JOB IN JOBBER ONCE BILLED', 'Not closed: it stays in the CANNOT INVOICE count.', 'r_hero', 1.6),
    ('OWNER', 'NOTHING LIVES ONLY ON THE BOARD', 'Answers go in Jobber, verdicts and flags in the sheets. The board only reads.', 'r_dots', 2.4),
])

# 4–5. Pathway 1: huddle ------------------------------------------------------------------------
g.path2(1, 'Run the 7:00 huddle', '10 minutes, standing at the wall, crew leads present', 'TODAY', 'LEAD',
        left=[img('huddle', 6.25)],
        right=[S([(1, 'Footer dots green? Amber or red: say so, run on the last numbers.'),
                  (2, '<b>NEEDS ATTENTION</b>, oldest first: word, name, days, initials.'),
                  (3, 'Each lead reads their <b>NOW</b> card and adds what it doesn’t say.'),
                  (4, '<b>CANNOT INVOICE</b>: the big number, then the top 3 lines.'),
                  (5, '<b>UNANSWERED</b> above 0: that lead answers in Jobber before rolling.'),
                  (6, 'Say the focus line. One sentence of recognition. Stop at 10 min.')],
                 who='0:00 → 10:00 · TOP TO BOTTOM'),
               note('<b>Red</b> = act today · <b>amber</b> = watch · <b>grey</b> = someone else’s clock.'),
               g.handoff('LEAD', 'Each set of initials owns that line by end of day.')])

words = ('<table class="rs"><tr><th>WORD</th><th>MEANS</th></tr>'
         '<tr><td>⚠ LATE</td><td>30 min past the scheduled end, still open in Jobber</td></tr>'
         '<tr><td>◌ NO RESULT</td><td>Marked done in Jobber, Visit result not answered</td></tr>'
         '<tr><td>◔ AWAITING REVIEW</td><td>Completed, waiting on a verdict</td></tr>'
         '<tr><td>✎ FIX · ❚❚ HOLD</td><td>Latest verdict says fix it, or the owner decides</td></tr>'
         '<tr><td>✓✓ READY · ✓✓ DONE</td><td>Both passes READY · grey once invoiced</td></tr></table>')
g.path2(1, 'Read a crew lane', 'Cards change by themselves as Jobber changes', 'TODAY', 'LEAD', cont=True,
        left=[img('lanes', 6.25), words],
        right=[S([(7, 'Red border + <b>⚠ Problem</b>: the responder taps <b>ACK</b> (pathway 4).'),
                  (8, '<b>● NOW</b>: from the start time until 30 min past the end.'),
                  (9, '<b>○ NOT STARTED</b>: start time not reached.'),
                  (10, 'Finished visits fold into one line.'),
                  (11, 'Next visit. After 15:00 the last line is <b>TOMORROW</b>.')],
                 who='ONE LANE PER CREW · UP TO 4'),
               note('A card leaves its lane at midnight. Tap any count box at the bottom to open <b>STAGES</b>.')])

# 6–7. Pathway 2: cannot invoice ----------------------------------------------------------------
g.path2(2, 'Clear what can’t be invoiced', 'Lines appear and leave by themselves; you only change the owner',
        'CANNOT INVOICE', 'OFFICE',
        left=[img('ci_list', 6.25), img('ci_pick', 6.25), img('ci_saved', 6.25)],
        right=[S([(1, 'Days in the current stage. Amber at 3, red at 7.'),
                  (2, 'Reason: one of ten (next page).'),
                  (3, 'Owner: initials, or <b>CREW</b> / <b>OFFICE</b> on FIX and HOLD.'),
                  (4, 'Stage clocks: done › 1st › 2nd › submitted › accepted.'),
                  (5, '<b>NO-REMINDER</b>: finished, Jobber never flagged it. <b>20+ d</b>: hard red.'),
                  (6, 'Wrong owner? <b>OWNER</b>, then your name + PIN.'),
                  (7, 'Tap the new owner’s initials.'),
                  (8, '<b>saved</b> confirms it.')], who='TOP BAR › CANNOT INVOICE'),
               M('A DATE', 'Said out loud at the huddle by its owner. No date: still red tomorrow.',
                 kicker='EVERY RED LINE GETS', size=30)])

REASONS = [
    ('PROGRAM-WAIT', 'Sent to CLEAResult, no answer yet (grey)', 'Accepted or Returned date typed in the sheet'),
    ('HOLD', 'Owner is deciding', 'Owner decides; Status filled in the sheet'),
    ('INSPECTION/PERMIT', 'Waiting on an inspection or permit', 'Inspection passes'),
    ('FIX OPEN', 'Photos or paperwork need a fix', 'Crew lead fixes; Status = Fixed'),
    ('RETURN NEEDED', 'Last visit Return needed or Problem, nothing booked', 'Book the return visit'),
    ('BLOWER DOOR FAIL', 'Under 20 % reduction', 'Retest, or a reviewer note'),
    ('FORM/QUANTITIES', 'Job form unanswered, or quantities missing', 'Complete the form in Jobber'),
    ('AWAITING 1ST', 'No 1st-pass verdict yet', '1st-pass READY'),
    ('AWAITING 2ND', '1st pass READY', '2nd-pass READY'),
    ('READY TO INVOICE', 'Both passes READY', 'Invoice or submit, then close in Jobber'),
]
table = ('<table class="rs"><tr><th>REASON (FIRST THAT FITS)</th><th>MEANS</th><th>CLEARS WHEN</th></tr>'
         + ''.join(f'<tr><td>{r}</td><td>{m}</td><td>{c}</td></tr>' for r, m, c in REASONS) + '</table>')
g.path2(2, 'The ten reasons', 'The board picks the first reason that fits, in this order', 'CANNOT INVOICE', 'OFFICE',
        cont=True, left=[table],
        right=[img('stages', 3.6, 'STAGES: Jobber’s columns and packages open against the cap of 15.'),
               note('<b>Hard red</b> at 20 days since completion with nothing submitted, whatever the reason.'),
               note('Grey <b>PROGRAM-WAIT</b> sits last: it is CLEAResult’s clock, not ours.')])

# 8–9. Pathway 3: review ------------------------------------------------------------------------
g.path2(3, 'Review a finished job', 'Each tap adds one row to the Photo Review Queue with your name and time',
        'REVIEW 🔒', 'OFFICE',
        left=[row(col(img('rv_tab', 1.75)), col(img('rv_pin', 4.3), flex=1)), img('rv_main', 6.25)],
        right=[S([(1, 'Tap <b>REVIEW</b>.'), (2, 'Tap your name.'), (3, 'Enter your 4-digit PIN.'),
                  (4, 'Pick a job waiting for your pass.'), (5, 'Open <b>CompanyCam</b>, check the photos.'),
                  (6, 'Read the overnight checker’s verdict.'), (7, '<b>READY</b>: the package is complete.'),
                  (8, '<b>FIX</b>: pick what must be fixed.'), (9, '<b>HOLD</b>: type why. The owner decides.')],
                 who='TOP BAR › REVIEW 🔒'),
               M('1ST-PASS READY', 'Before it, the 2nd-pass READY button is greyed out.', kicker='2ND-PASS READY NEEDS', size=24)])

g.path2(3, 'FIX, HOLD and the 2nd pass', 'Same screen; the job leaves your list once your pass is in', 'REVIEW 🔒', 'OFFICE',
        cont=True, left=[img('rv_fix', 6.25), img('rv_lock', 6.25)],
        right=[S([(10, 'FIX: tap the one thing to fix. It saves at once.'),
                  (11, 'Your verdict shows as the latest human verdict.'),
                  (12, '2nd pass: READY stays grey until the 1st pass says READY.')], who='AFTER STEP 8'),
               note('<b>UNMATCHED</b> box: a sheet row the board can’t tie to one job. Type its <b>Job #</b> in the sheet.'),
               note('Leaving REVIEW locks it. 60 s without a touch: back to TODAY.'),
               g.handoff('OFFICE', 'Invoices or submits the package, types the Submitted date, closes the job in Jobber.')])

# 10. Pathway 4: ACK ----------------------------------------------------------------------------
g.path2(4, 'Acknowledge a Problem', 'The ACK button shows the moment a crew answers Problem', 'TODAY · ACK', 'LEAD',
        left=[row(col(img('ack_lane', 3.0)), col(img('ack_done', 3.0))), img('ack_pin', 6.25)],
        right=[S([(1, 'Tap <b>ACK</b> on the Problem card.'), (2, 'Tap your name (office or owner).'),
                  (3, 'Enter your PIN.'), (4, 'Red border clears. Call the crew lead.')], who='TODAY › CREW LANE'),
               M('ACK IN 15 MIN', 'Late: red border on the wall and one text to the owner.', kicker='A PROBLEM NEEDS AN', size=26),
               note('The ACK becomes the line <b>ACK 9:30 JA</b> in the Jobber visit note. Until Jobber writes are on it waits as <b>queued</b> in the footer.'),
               g.handoff('LEAD', 'Talks it through with the responder and books a return if needed.')])

# 11. Pathway 5: tools --------------------------------------------------------------------------
g.path2(5, 'Focus, responder and flags', 'Office or owner PIN; the tools sit on the REVIEW screen', 'REVIEW 🔒 · TOOLS', 'OWNER',
        left=[row(col(img('tl_focus', 3.3)), col(img('tl_flag', 2.75)))],
        right=[S([(1, '<b>FOCUS</b>: today’s line for the wall.'), (2, 'Up to 30 characters, then <b>save</b>.'),
                  (3, '<b>RESPONDER</b>: who answers Problems today.'), (4, '<b>FLAG</b>: log an issue.'),
                  (5, 'Pick the issue, employee, job number, crew, notes, <b>save</b>.')],
                 who='REVIEW › OFFICE OR OWNER PIN'),
               note('Flags are for the KPI <b>Flags</b> tab and its incident email; they save on the office PC until the sheets are connected. Never on the TV.'),
               note('A focus line that looks like money, an address or a phone number is refused.'),
               g.handoff('OWNER', 'Gets the incident email and handles it privately.')])

# 12. Pathway 6: scorecard ----------------------------------------------------------------------
g.path2(6, 'Monday scorecard', 'Office only, Monday 7:15–7:45, after the crews roll', 'SCORECARD 🔒', 'OWNER',
        left=[img('sc_tab', 2.2), img('sc', 6.25)],
        right=[S([(1, 'Tap <b>SCORECARD</b>, enter your PIN.'), (2, 'Read last week’s row. Grey words name each number’s owner.'),
                  (3, 'First-pass READY by crew: only here, never on the wall.'),
                  (4, 'Red two weeks running: onto the issues list.')], who='TOP BAR › SCORECARD 🔒'),
               note('No targets for the first 4 weeks; then targets come from that baseline. Never used for discipline or bonus.'),
               note('<b>—</b> means that feed doesn’t exist yet.'),
               g.handoff('OWNER', 'Takes the reds into private conversations.')])

# 13. Cadence -----------------------------------------------------------------------------------
cad = ('<table class="tl"><tr><th style="width:1.15in"></th><th>06:55</th><th>07:00</th><th>07:10</th><th>ALL DAY</th>'
       '<th>16:00</th><th>16:30</th><th>17:00</th></tr>'
       '<tr><td class="who">OWNER</td><td class="you">Footer dots green?</td><td class="you">Run the huddle</td><td></td>'
       '<td class="flag">Text arrives: Problem 15 min without ACK</td><td></td><td></td><td class="you">2nd-pass verdicts done</td></tr>'
       '<tr><td class="who">OFFICE</td><td></td><td></td><td class="you">Focus line + responder</td>'
       '<td class="you">ACK each Problem within 15 min</td><td class="you">CLOSE lines in Jobber for unanswered visits</td><td></td><td></td></tr>'
       '<tr><td class="who">CREW LEAD</td><td></td><td class="you">Read your lane</td><td></td>'
       '<td class="you">Answer Visit result before leaving each job</td><td></td><td class="you">1st-pass verdicts done (1st-pass reviewer)</td><td></td></tr>'
       '<tr><td class="who">BOARD</td><td class="sys">Reading Jobber every minute from 06:00</td><td></td><td></td>'
       '<td class="sys">Cards move · LATE · NO RESULT · red borders</td><td></td><td></td><td class="sys">Verdict cut-off shows amber</td></tr></table>')
week = g.tasks(None, ['<b>Monday 07:00</b>: each crew lead, 1-minute week forecast', '<b>Monday 07:15</b>: office scorecard (pathway 6)',
                      '<b>Friday</b>: type Submitted / Accepted / Returned dates in the Review sheet',
                      '<b>Friday</b>: clear the UNMATCHED rows (type the Job #)'], title='EVERY WEEK')
month = g.tasks(None, ['Remove anything nobody looked at for 30 days', 'PIN or crew changes: update the roster on the office PC',
                       'Check <b>docs/jobber-assumptions.md</b> for open answers'], title='EVERY MONTH')
g.page('<div class="ptitle">Your day and week</div>' + cad + row(col(week, flex=1), col(month, flex=1)))

# 14. Troubleshooting ---------------------------------------------------------------------------
g.checks_page('Board looks wrong?', [
    'Red <b>DATA STALE</b> banner: is the office PC awake and online? The numbers are the last good ones.',
    'Footer dots: <b>JOBBER</b> turns amber after 10 min without a load, red after 30.',
    'Service stopped: <b>services.msc › SealTechBoard › Start</b>.',
    'Tiny text, or a red <b>DPR</b> badge: restart the PC so the kiosk opens at scale 2.',
    'Card shows no result all day: the visit has no Visit result form and no CLOSE line was written.',
    'Job on the rail that shouldn’t be: close or invoice it in Jobber; it leaves on the next refresh.',
    'Verdict missing: the row is UNMATCHED; type the Job # in the sheet.',
    'Still wrong: note the time and what you saw, then ask Claude in a session on this repository.',
], side_html=img('stale', 4.3) + img('r_dots', 4.3) + note('Freshness dots: JOBBER · REVIEW · FLAGS · PHOTOS. Hollow = not connected yet.'))

# 15. Keep it running ---------------------------------------------------------------------------
run = ('<div class="kv">'
       '<b>Laptop trial</b><span><b>npm run demo</b> → localhost:5173 · or the phone link</span>'
       '<b>Office PC</b><span>Windows service <b>SealTechBoard</b> · Chrome kiosk at logon</span>'
       '<b>Secrets</b><span>Only in <b>C:\\SealTech\\board\\.env</b>. Never in chat, Notion or a sheet.</span>'
       '<b>Practice PINs</b><span><b>1234</b> for every TESTVILLE person; refused in live mode</span>'
       '<b>Docs</b><span><b>docs/</b>: decisions, huddle card, owner routine, kiosk setup</span></div>')
g.path2(7, 'Keep it running', 'Change a decision first, then the code', 'OFFICE PC · GITHUB', 'OWNER',
        left=[g.tasks(None, [], title='WHERE THINGS ARE').replace('<ul></ul>', run),
              note('The code is on branch <b>claude/charming-lamport-g5jjc3</b>. Merge it to <b>main</b> before installing on the office PC.')],
        right=[S([(1, 'Decide the change; add it to <b>docs/owner-decisions.md</b>.'),
                  (2, 'Ask Claude in a session on <b>SealTech-Dashboard</b>, naming the decision.'),
                  (3, 'Look at the new wall screenshots before it ships.'),
                  (4, 'Office PC: <b>git pull · npm ci · npm run build</b>.'),
                  (5, 'Restart the <b>SealTechBoard</b> service.')], who='TO CHANGE ANYTHING')])

# 16. What comes next ---------------------------------------------------------------------------
NEXT = [
    ('Jobber developer app', 'Live jobs on the wall instead of TESTVILLE', 'A Cowork session on the office PC follows <b>docs/jobber-app-handoff.md</b>'),
    ('Google service account', 'Verdicts and flags land in the two sheets', 'Share both sheets with it; key file next to .env'),
    ('Jobber note writes', 'ACK and crew recap reach Jobber; RECAP screen', 'Approve the app’s note-write permission'),
    ('Instant updates', 'Cards move within seconds, not a minute', 'Set up the Jobber webhooks'),
    ('CompanyCam feed', 'Photo count and last capture on each card', 'Fix the CompanyCam time zone; add an API token'),
]
nt = ('<table class="rs"><tr><th>NEXT</th><th>UNLOCKS</th><th>WHAT YOU DO</th></tr>'
      + ''.join(f'<tr><td>{a}</td><td>{b}</td><td>{c}</td></tr>' for a, b, c in NEXT) + '</table>')
g.page('<div class="ptitle">What comes next</div><div class="q">IN THIS ORDER · EACH ONE UNLOCKS THE NEXT</div>' + nt
       + row(col(note('<b>Two-week trial first:</b> run the laptop at the 07:00 huddle, then mount the panel once the habit holds.'), flex=1),
             col(note('<b>The first step is the Jobber app.</b> Until it exists, the wall shows practice jobs only.'), flex=1)))

bad = g.render(OUT, 'out/guide.html')
print('overflow:', bad, '| missing:', sorted(set(g.missing)), '|', len(g.pages), 'pages ->', OUT)
assert not bad and not g.missing
