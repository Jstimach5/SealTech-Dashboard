"""Annotated crops for the SealTech production board guide. Coordinates are 3840x2160 capture pixels,
taken from shots/boxes.json (the real controls' positions recorded while driving the board)."""
import json, os
from assets import crop_annotate

SH, OUT = 'shots/', 'assets/board/'
os.makedirs(OUT, exist_ok=True)
B = json.load(open(SH + 'boxes.json'))
def bx(shot, tid, n, crit=False, pad=6):
    x0, y0, x1, y1 = B[shot][tid]
    return (x0 - pad, y0 - pad, x1 + pad, y1 + pad, n, crit)
T = '01_today'

crops = {
    # huddle: the whole TODAY screen, zones numbered in huddle order
    'huddle': ('01_today.png', (150, 90, 3700, 2080), 0.42,
               [(186, 1984, 1290, 2056, 1), bx(T, 'attention', 2), bx(T, 'lanes', 3), bx(T, 'rail', 4),
                bx(T, 'counts', 5), bx(T, 'focus-line', 6)], [], 4.8),
    # lanes close-up: card states
    'lanes': ('01_today.png', (180, 925, 2615, 1720), 0.62,
              [bx(T, 'card-v-test-nguyen-1', 7, True), bx(T, 'card-v-test-rowe-2', 8), bx(T, 'card-v-test-ibrahim-1', 9),
               bx(T, 'done-row', 10), (196, 1592, 780, 1690, 11)], [], 2.6),
    'stale': ('16_stale.png', (180, 95, 1950, 245), 0.9, [(688, 105, 1870, 235, None, True)], [], 1.6),
    # rules thumbnails
    'r_unans': ('01_today.png', (2200, 1738, 2612, 1950), 0.8, [bx(T, 'counts-unanswered', None, True, 2)], [], 1.6),
    'r_ack': ('01_today.png', (186, 1012, 778, 1588), 0.5, [bx(T, 'ack-v-test-nguyen-1', None, True)], [], 2.2),
    'r_verd': ('10_review.png', (215, 1420, 1265, 1685), 0.55, [(222, 1426, 1258, 1678, None, True)], [], 2.2),
    'r_fix': ('03_cannot.png', (186, 1000, 2250, 1186), 0.45, [(192, 1006, 2245, 1180, None, True)], [], 2.6),
    'r_hero': ('01_today.png', (2650, 432, 3646, 830), 0.42, [], [], 2.6),
    'r_dots': ('01_today.png', (186, 1982, 1700, 2058), 0.55, [(186, 1984, 1290, 2056, None, True)], [], 2.2),
    # cannot invoice list
    'ci_list': ('03_cannot.png', (180, 280, 3660, 1195), 0.4,
                [(200, 478, 420, 562, 1), (1620, 476, 2610, 566, 2), (2615, 474, 2732, 568, 3),
                 (440, 565, 1830, 632, 4), (2250, 565, 3330, 632, 5), bx('03_cannot', 'owner-j-test-bauer', 6)], [], 5.0),
    'ci_pick': ('05_owner_pick.png', (180, 465, 3660, 800), 0.4,
                [bx('05_owner_pick', 'owner-pick-KA', 7, True)], [], 5.0),
    'ci_saved': ('06_owner_saved.png', (180, 462, 3660, 645), 0.4,
                 [bx('06_owner_saved', 'owner-note-j-test-bauer', 8)], [], 5.0),
    'stages': ('02_stages.png', (180, 280, 3660, 1950), 0.3, [bx('02_stages', 'packages-open', None, True)], [], 5.0),
    # review
    'rv_pin': ('09_review_pin.png', (180, 100, 3660, 1600), 0.36,
               [bx('09_review_pin', 'pin-tile-u-test-ashby', 2), (2650, 590, 3560, 1590, 3)], [], 5.0),
    'rv_tab': ('09_review_pin.png', (2860, 110, 3660, 236), 0.8, [bx('01_today', 'tab-review', 1)], [], 1.6),
    'rv_main': ('10_review.png', (180, 280, 3660, 1700), 0.38,
                [bx('10_review', 'review-queue', 4), bx('10_review', 'companycam', 5), bx('10_review', 'verdict-checker', 6),
                 bx('10_review', 'verdict-ready', 7), bx('10_review', 'verdict-fix', 8), bx('10_review', 'verdict-hold', 9),
                 bx('10_review', 'unmatched', None)], [], 5.0),
    'rv_fix': ('11_fix_pick.png', (215, 950, 2475, 1790), 0.5,
               [bx('11_fix_pick', 'css:[data-testid="fix-pick"] >> nth=1', 10, True)], [], 2.8),
    'rv_lock': ('13_tools_focus.png', (200, 1140, 2480, 1820), 0.5,
                [(210, 1470, 820, 1795, 12, True), (1350, 1150, 2465, 1465, 11)], [], 2.8),
    # ACK
    'ack_lane': ('01_today.png', (180, 935, 790, 1600), 0.6, [bx(T, 'ack-v-test-nguyen-1', 1, True)], [], 2.2),
    'ack_pin': ('07_ack_pin.png', (180, 140, 3660, 1600), 0.36,
                [bx('07_ack_pin', 'pin-tile-u-test-office', 2), (2650, 590, 3560, 1590, 3)], [], 5.0),
    'ack_done': ('08_today_acked.png', (180, 935, 790, 1600), 0.6, [bx('08_today_acked', 'card-v-test-nguyen-1', 4)], [], 2.2),
    'ack_q': ('08_today_acked.png', (2440, 1982, 2700, 2058), 0.9, [bx('08_today_acked', 'queued', None, True, 2)], [], 1.4),
    # office tools
    'tl_focus': ('13_tools_focus.png', (2520, 770, 3660, 1225), 0.75,
                 [bx('13_tools_focus', 'tool-focus', 1), bx('13_tools_focus', 'focus-form', 2), bx('13_tools_focus', 'tool-responder', 3)], [], 2.0),
    'tl_flag': ('14_tools_flag.png', (2520, 770, 3660, 1945), 0.55,
                [bx('14_tools_flag', 'tool-flag', 4), bx('14_tools_flag', 'flag-form', 5, True)], [], 2.4),
    # scorecard
    'sc': ('15_scorecard.png', (180, 270, 3660, 980), 0.42,
           [(192, 300, 3648, 770, 2), bx('15_scorecard', 'scorecard-crews', 3)], [], 4.6),
    'sc_tab': ('01_today.png', (2860, 110, 3660, 236), 0.8, [bx(T, 'tab-scorecard', 1)], [], 1.6),
}
sizes = {}
for k, (src, crop, sc, boxes, tags, kk) in crops.items():
    sizes[k] = crop_annotate(SH + src, crop, boxes, OUT + k + '.jpg', scale=sc, tags=tags, k=kk)
json.dump(sizes, open(OUT + 'sizes.json', 'w'))
print(len(sizes), 'assets')
