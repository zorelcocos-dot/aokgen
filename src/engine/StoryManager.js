/**
 * StoryManager - Holds all narrative clues, documents, photographs,
 * CCTV logs, and progressive story revelation without exposition dump.
 * The player pieces together Route 17 Store #09 incident.
 */

export const STORY_BEATS = {
  INTRO: 'INTRO',
  ARRIVAL: 'ARRIVAL',
  INSIDE: 'INSIDE',
  FIRST_CLUE: 'FIRST_CLUE',
  FREEZER: 'FREEZER',
  BLACKOUT: 'BLACKOUT',
  GENERATOR: 'GENERATOR',
  COLONEL: 'COLONEL',
  ESCAPE: 'ESCAPE',
  ENDING: 'ENDING'
};

export class StoryManager {
  constructor() {
    this.currentBeat = STORY_BEATS.INTRO;
    this.discoveredClues = new Set();
    this.readDocuments = new Set();
    this.cctvWatched = new Set();
    this.secretFound = false;
    this.endingType = null;

    // All narrative documents - environmental storytelling
    this.documents = new Map([
      ['timecard_0314', {
        id: 'timecard_0314',
        title: 'Timecard - Last Punch',
        type: 'timecard',
        content: `EMPLOYEE TIMECARD #09-17
----------------------------
NAME: M. JOHNSON - FRY COOK
PUNCH IN:  11:02 PM - 11/08/93
PUNCH OUT: --:-- --

NOTE SCRAWLED IN RED:
"IT'S 3:14 AGAIN. THE LIGHTS BREATHE.
HE DOESN'T LEAVE. HE'S IN THE FREEZER.

IF YOU READ THIS, DON'T CLOCK IN."
`,
        location: 'Service Counter',
        reveals: 'The last employee never punched out. 03:14 is recurring.'
      }],
      ['schedule_clipboard', {
        id: 'schedule_clipboard',
        title: 'Weekly Schedule - Nov 1993',
        type: 'clipboard',
        content: `STORE #09 - STAFF SCHEDULE
MON: M Johnson (CLOSED EARLY - sick)
TUE: S Park (NO SHOW)
WED: J Alvarez (QUIT - family emergency)
THU: M Johnson (MISSING)
FRI: ------- (COVER NOT FOUND)
SAT: CLOSED - MAINTENANCE

MANAGER NOTE:
"Colonel says we don't close. Ever.
Meat delivery arrived frozen solid but moving.
Put it in vault #4. Don't open."

ON BACK:
"Ball pit cleaning - child lost toy, left crying.
Said something grabbed his ankle. -M"`,
        location: 'Kitchen Wall',
        reveals: 'Staff disappeared one by one. Strange meat delivery.'
      }],
      ['incident_report', {
        id: 'incident_report',
        title: 'Incident Report File #09-B',
        type: 'report',
        content: `FRANCHISE INCIDENT REPORT - CONFIDENTIAL
Date: 11/09/93  Location: Store #09
Reporting: District Manager Harland

At approx 03:14 AM, freezer vault temperature
dropped to -40F despite power normal. Employee
M. Johnson reported hearing "pecking" from inside
packaged meat.

Second incident: meat grinder in basement
activated by itself. 11 lbs of product
unaccounted for.

Action Taken: Product discarded. Employee
sent home. Store to remain open.

Addendum 11/10: Johnson did not come home. Wife
called. I told her he quit.
`,
        location: 'Manager Office',
        reveals: 'Company covered up incidents. Meat was alive.'
      }],
      ['employee_photo', {
        id: 'employee_photo',
        title: 'Polaroid - Staff Party July 93',
        type: 'photo',
        content: `[ Photo shows 6 employees in front of menu board ]
On back in marker:
"Top row: Sara (quit), Mike (missing), Jen (hospital)

Bottom row: Carlos, Me, and HARLAND???

We never hired him. He just... started showing up.
He wears the white suit. He never blinks.

- M"

Faces of Sara and Mike have been scratched out.
Third face from left (Harland) has eyes burned through with cigarette.`,
        location: 'Manager Office',
        reveals: 'The Colonel is not an employee - an intruder/entity.'
      }],
      ['meat_manifest', {
        id: 'meat_manifest',
        title: 'Delivery Manifest - AOKGEN PROTEIN SOLUTIONS',
        type: 'manifest',
        content: `DELIVERY MANIFEST #8847
CLIENT: COLONEL'S FAMILY KITCHEN #09
PRODUCT: PREMIUM CHICKEN - GRADE A
QTY: 40 LBS - LOT #11-11-11
SOURCE: SITE-4

SPECIAL INSTRUCTIONS:
KEEP BELOW -20C. DO NOT INCUBATE ABOVE 4C FOR
MORE THAN 6 HOURS. GROWTH IS EXPONENTIAL.

If hatching observed, do NOT feed.
Incinerate entire vault. Call hotline.

[ HOTLINE NUMBER BLACKED OUT WITH MARKER ]

Stamp: REJECTED - ATTEMPTED RETURN 11/08
Reason: "IT KNOWS MY NAME"`,
        location: 'Freezer Vault',
        reveals: 'The chicken was bio-engineered. It hatches.'
      }],
      ['generator_log', {
        id: 'generator_log',
        title: 'Maintenance Log - Emergency Generator',
        type: 'log',
        content: `GENSET 5000 - DIESEL EMERGENCY POWER
Last serviced: 10/28/93

NOV 08: Main breaker tripped twice during
dinner rush. Fryers draw too much after
meat change. Recommend reduce load.

NOV 09 02:10 AM: Fuel low (15%). M filled one
can from mop closet but left second in
restroom storage. Check ball pit - kids steal fuel
cans for some reason.

NOV 09 03:11 AM: Cannot restart. Something
jammed in exhaust. Sounds like scratching.

[ Last entry written hurriedly, trailing off ]
IF IT GETS TO THE GENERATOR IT GETS TO THE...`,
        location: 'Generator Room',
        reveals: 'Generator needs 2 fuel cans, one hidden in restroom.'
      }],
      ['cctv_note', {
        id: 'cctv_note',
        title: 'Post-it on CCTV Monitor',
        type: 'note',
        content: `"DON'T WATCH CAM 3 AFTER MIDNIGHT
IT WATCHES BACK
- S"

Below, in different handwriting:
"CAM 4 shows kitchen at 03:14:11
BUT WE CLOSED AT 11. WHO IS FRYING?

Check drive-thru cam. Someone standing
outside window for 3 hours. Not moving.

Calling district."`,
        location: 'Security Office',
        reveals: 'CCTV shows anomalies at 03:14.'
      }],
      ['child_drawing', {
        id: 'child_drawing',
        title: 'Crayon Drawing Found in Ball Pit',
        type: 'drawing',
        content: `[ Child's drawing in red and black crayon:
Tall white man with big smile standing behind
counter. Behind him, big chicken shadow with
human teeth. In ball pit, many small eyes.

Text in child writing: "THE CHICKEN MAN
LIVES UNDER THE BALLS HE EATS THE LOST KIDS"

Corner: "FOR MOMMY - FOUND THE YELLOW KEY!" ]`,
        location: 'Ball Pit',
        reveals: 'Keycard hidden in ball pit. Hatchlings beneath.'
      }],
      ['grinder_receipt', {
        id: 'grinder_receipt',
        title: 'Meat Grinder Service Receipt',
        type: 'receipt',
        content: `SERVICE CALL #112
EQUIPMENT: INDUSTRIAL GRINDER #2 - BASEMENT
ISSUE: Blade jam - "contains bone & fabric"

Tech notes: Found employee nametag fabric,
apron string, and what looks like... phalanges

Cleaned, oiled, returned to service.
Client paid cash. Told me not to log.

- T. McAllister, R&M Services`,
        location: 'Basement - Secret',
        reveals: 'Employees were ground.'
      }],
      ['radio_transcript', {
        id: 'radio_transcript',
        title: 'Emergency Broadcast Transcript',
        type: 'radio',
        content: `DISPATCH 11/09/93 03:19 AM - ROUTE 17
Caller: Motorist reports "restaurant lights on
but all cars in lot abandoned, doors locked.
Saw someone inside kitchen but not moving right."

Deputy responded, found no one. Store locked.
Meat left in fryers burning. Back door open
to woods. Footprints - bare? - leading into
treeline. Not human.

Wrapped call as animal break-in. Route 17
requests welfare check on Store #09 staff.
None of them found.

[ Recording ends with 17 seconds of scratching ]`,
        location: 'Police Scanner (Car Radio)',
        reveals: 'Officially covered up. Something went into woods.'
      }],
      ['colonel_note', {
        id: 'colonel_note',
        title: 'Letter - Inside Colonel Portrait',
        type: 'secret',
        content: `[ Typed letter, aged, found behind cursed portrait ] 

"The 11 herbs and spices were a lie.
There were only ever 10. The 11th was hunger.

We engineered hunger to grow. Hunger that pecks.
Hunger that learns your shift pattern.

Store #09 was perfect. Isolated. No one counts
the missing in towns like this.

If you wear the suit, you become the store.

I wore it for 40 years. Now it's your turn.

- H"

And below in fresh blood:
"Tried to burn suit. It doesn't burn."`,
        location: 'Behind Portrait - Secret',
        reveals: 'The suit is cursed. The Colonel is a mantle.'
      }]
    ]);

    this.cctvFeeds = [
      { id: 'cam1', name: 'CAM 1 - DINING', disturbance: false, note: 'Empty tables. One chair rocking alone.' },
      { id: 'cam2', name: 'CAM 2 - KITCHEN', disturbance: true, note: 'Fryer oil bubbling with no one there. Shadow moves.' },
      { id: 'cam3', name: 'CAM 3 - BALL PIT', disturbance: true, note: 'Balls moving by themselves. Yellow glint.' },
      { id: 'cam4', name: 'CAM 4 - MANAGER OFFICE', disturbance: true, note: 'Figure in white suit standing perfectly still behind desk.' },
      { id: 'cam5', name: 'CAM 5 - FREEZER VAULT', disturbance: true, note: 'Meat bags swell and deflate like breathing.' },
      { id: 'cam6', name: 'CAM 6 - DRIVE-THRU', disturbance: false, note: 'Your car still there. Something walks past it.' }
    ];
  }

  discoverClue(id) {
    if (!this.discoveredClues.has(id)) {
      this.discoveredClues.add(id);
      const doc = this.documents.get(id);
      if (doc) this.readDocuments.add(id);
      return doc;
    }
    return null;
  }

  watchCCTV(camId) {
    this.cctvWatched.add(camId);
    const feed = this.cctvFeeds.find(f => f.id === camId);
    return feed;
  }

  getDiscoveredCount() {
    return this.discoveredClues.size;
  }

  getTotalClues() {
    return this.documents.size;
  }

  isForestOfSecrets() {
    return this.discoveredClues.size >= Math.floor(this.documents.size * 0.7);
  }

  progressBeat(beat) {
    this.currentBeat = beat;
  }

  getStoryContext() {
    const discovered = Array.from(this.discoveredClues);
    let context = '';
    if (discovered.includes('timecard_0314')) context += 'Knows 03:14 significance. ';
    if (discovered.includes('meat_manifest')) context += 'Knows meat is bio-engineered. ';
    if (discovered.includes('employee_photo')) context += 'Knows Colonel is imposter entity. ';
    if (discovered.includes('grinder_receipt')) context += 'Knows employees were ground. ';
    if (discovered.includes('colonel_note')) context += 'Knows suit is cursed mantle. ';
    return context.trim();
  }

  /**
   * Lore-flavoured objective line, keyed to the QuestManager STEP enum.
   * This is only a fallback - the HUD writes its own per-step text - so it
   * stays deliberately atmospheric rather than instructional.
   */
  getObjectiveText(step) {
    switch (step) {
      case 0:  return 'The engine is dead. The only lights for miles are ahead.';
      case 1:  return 'Store #09. The doors are open at three in the morning.';
      case 2:  return 'You clocked in. The timecard before yours says 03:14.';
      case 3:  return 'The manager locked something away before he stopped coming in.';
      case 4:  return 'A child hid the keycard. The freezer is what they hid it from.';
      case 5:  return 'Vault #4 is still warm. The manifest was not lying.';
      case 6:  return 'The fryers pulled the grid down. Something moved in the dark.';
      case 7:  return 'The old generator is in the basement. It needs fuel.';
      case 8:  return 'Power is back. So is he. The man in white wants his key.';
      case 9:  return 'The drive-thru shutter is the only way out. Get to the car.';
      case 10: return 'Drive. Do not look at the mirror.';
      default: return 'Survive.';
    }
  }

  /** Restores the narrative state for a fresh run. */
  reset() {
    this.currentBeat = STORY_BEATS.INTRO;
    this.discoveredClues.clear();
    this.readDocuments.clear();
    this.cctvWatched.clear();
    this.secretFound = false;
    this.endingType = null;
  }
}
