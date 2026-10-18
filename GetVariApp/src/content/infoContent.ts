/**
 * The text of the in-app Terms & Conditions, Privacy Policy and Help &
 * Support screens.
 *
 * The Privacy Policy describes what the app does today and nothing more: each
 * statement in it corresponds to something in the code (the profile saved at
 * onboarding, the hydration log, the wearable snapshots, the chat request).
 * When the app starts or stops handling a kind of data, this is the file to
 * change with it. It makes no promise about retention, deletion, encryption or
 * sharing, because the app implements no rule of its own for any of them.
 */

export type InfoTopic = 'about' | 'terms' | 'privacy' | 'help';

export interface InfoSection {
  heading: string;
  /**
   * Paragraphs, in order. A line starting with "• " is drawn as a bullet, and
   * one starting with "1. ", "2. " … as a numbered step.
   */
  body: string[];
}

export interface InfoDocument {
  title: string;
  subtitle: string;
  intro: string;
  sections: InfoSection[];
}

const ABOUT: InfoDocument = {
  title: 'About',
  subtitle: 'GetVari',
  intro: 'AI-Powered Hydration Intelligence.',
  sections: [
    {
      heading: 'What GetVari does',
      body: [
        'A hydration companion that estimates your daily water requirement and hydration risk from your profile, your logged drinks and your GetVari wearable.',
      ],
    },
    {
      heading: 'What you will find in the app',
      body: [
        '• A Hydration Risk Score, with the reasons behind it.',
        '• A personalised Daily Water Requirement.',
        '• Fluid logging, history and analytics.',
        '• Reminders and alerts that stay silent while you sleep.',
        '• An in-app assistant for hydration questions.',
      ],
    },
    {
      heading: 'A wellness tool',
      body: [
        'GetVari is not a medical device, and its estimates are not medical advice. See Terms & Conditions for details.',
      ],
    },
  ],
};

const TERMS: InfoDocument = {
  title: 'Terms & Conditions',
  subtitle: 'Using GetVari',
  intro:
    'These terms describe how GetVari is meant to be used. By signing in and using the app, you agree to them.',
  sections: [
    {
      heading: 'What GetVari is',
      body: [
        'GetVari is a hydration companion. It estimates a daily water requirement and a hydration risk score from the profile you provide, the drinks you log and, when one is connected, readings from your GetVari wearable.',
      ],
    },
    {
      heading: 'Not medical advice',
      body: [
        'GetVari is a wellness tool. It does not diagnose, treat or prevent any medical condition, and its scores, targets, alerts and assistant replies are estimates — not medical advice.',
        'If you have a medical condition, are on a fluid restriction, or have been given a daily limit by a physician, follow your physician’s guidance. Where the app lets you enter a physician-set limit, that limit is used in place of the app’s own estimate.',
        'If you feel unwell, contact a medical professional. Do not rely on the app in an emergency.',
      ],
    },
    {
      heading: 'Your account and information',
      body: [
        'You sign in with your mobile number. Keep your phone secure, since anyone who can use it can open your account in the app.',
        'The estimates depend on what you tell the app. Please keep your profile — such as weight, activity level, health conditions and sleep times — accurate and up to date.',
      ],
    },
    {
      heading: 'Estimates and their limits',
      body: [
        'Scores and targets are calculated from the information available at the time. They can be affected by missing or inaccurate entries, a disconnected or low-battery wearable, and sensor limitations.',
        'Reminders and alerts depend on your phone’s notification, alarm and battery settings, and on the sleep hours you set. They may arrive late or not at all.',
      ],
    },
    {
      heading: 'Acceptable use',
      body: [
        'Use GetVari for your own personal hydration tracking. Do not misuse the app, attempt to disrupt it, or try to access another person’s account or data.',
      ],
    },
    {
      heading: 'Changes',
      body: [
        'GetVari is under active development. Features, calculations and these terms may change as the app is updated; the current version is always available on this screen.',
      ],
    },
  ],
};

const PRIVACY: InfoDocument = {
  title: 'Privacy Policy',
  subtitle: 'Your data in GetVari',
  intro:
    'This page explains what information GetVari handles, what it is used for, and where it is kept. It describes the app as it works today.',
  sections: [
    {
      heading: 'Information you provide',
      body: [
        '• Your mobile number, used to sign you in.',
        '• Your profile: name, age, gender, weight, activity level, fitness goal, work environment, usual water habit, any health conditions you select, and a physician-set daily limit if you enter one.',
        '• Your usual sleep and wake-up times.',
        '• Your city. If you allow location access, the app uses your device’s location to find the nearest city, and saves that city and its coordinates with your profile.',
        '• The drinks you log: the amount and the time.',
        '• Messages you send to the in-app assistant.',
      ],
    },
    {
      heading: 'Information from your wearable',
      body: [
        'When a GetVari wearable is connected over Bluetooth, the app reads heart rate, activity (strain and steps), temperature, humidity and the wearable’s battery level.',
        'The app keeps a daily summary of these readings (averages and step totals) for the most recent seven days, and records the wearable’s identifier, name, battery level and last sync time against your account.',
      ],
    },
    {
      heading: 'How it is used',
      body: [
        '• To calculate your daily water requirement and your hydration risk score.',
        '• To show your intake, history and analytics.',
        '• To schedule reminders and alerts, and to keep them silent during your sleep hours.',
        '• To answer your questions in the assistant. When you send a message, the message, the recent conversation and your profile are sent to the GetVari assistant service to generate the reply.',
      ],
    },
    {
      heading: 'Where it is kept',
      body: [
        'Your profile, hydration log, daily water target, wearable summaries and wearable details are saved to your GetVari account in the app’s cloud database (hosted on Supabase), so they are available when you sign in again. Sign-in by mobile number uses Firebase Authentication.',
        'Some information stays on your phone only, including your recent notification history, reminder settings, and your dark or light mode choice.',
      ],
    },
    {
      heading: 'Permissions the app asks for',
      body: [
        '• Notifications, alarms and reminders — to deliver hydration reminders and alerts at the right time.',
        '• Display over other apps and full-screen notifications — to show a reminder when your phone is locked or another app is open.',
        '• Bluetooth and nearby devices — to find and connect to your wearable.',
        '• Location — to detect your city, and because Android requires it for Bluetooth scanning.',
        'You can change any of these in your phone’s settings. Some features will not work without them.',
      ],
    },
    {
      heading: 'Your choices',
      body: [
        'You can review and edit your profile at any time from Account. You can turn off notifications or revoke permissions in your phone’s settings, and you can sign out from Account.',
      ],
    },
  ],
};

const HELP: InfoDocument = {
  title: 'Help & Support',
  subtitle: 'How GetVari works',
  intro: 'A short guide to the dashboard and to the things people most often ask about.',
  sections: [
    {
      heading: 'Getting Started',
      body: [
        '1. Sign in with your mobile number.',
        '2. Complete your profile: your details, activity level, any health conditions, your city, and your usual sleep and wake-up times.',
        '3. Allow the permissions the app asks for — notifications in particular — so reminders can reach you.',
        'Your dashboard is ready as soon as the profile is saved. You can change your profile later from Account in the bottom menu.',
      ],
    },
    {
      heading: 'Wearable / Device',
      body: [
        'The GetVari wearable connects over Bluetooth and supplies heart rate, strain, temperature and humidity readings. Keep Bluetooth on and the wearable nearby.',
        'The device card near the bottom of the dashboard shows whether readings are arriving. Until a reading arrives, the tiles show “--” rather than a guess.',
      ],
    },
    {
      heading: 'Hydration Risk Score',
      body: [
        'The score runs from 0 to 100; lower is better. It is worked out from five inputs: heart rate, activity, temperature, humidity and the time since your last drink.',
        'The card shows the current band, a suggested action, and how much each input is contributing. Logging a drink lowers the score as the water is absorbed.',
      ],
    },
    {
      heading: 'Daily Water Requirement',
      body: [
        'Your daily target is personalised from your profile and adjusted for activity, temperature, humidity, work environment and health conditions, up to a safe upper limit.',
        'It is set once for the day so it does not move while you are drinking against it. If you have a physician-set limit, that limit is used. Consumed, Daily Target and Remaining are charted under the score.',
      ],
    },
    {
      heading: 'Fluid Logging',
      body: [
        'Tap the log icon at the top right, or Log in the bottom menu, to record a drink. You can also use the quick amounts in the Fluid Log Station, or tell the assistant what you drank.',
        'Each entry appears in Fluid Logs with its time, and your totals and risk score update straight away.',
      ],
    },
    {
      heading: 'Notifications & Reminders',
      body: [
        'GetVari sends a Good Morning message 30 minutes after your wake-up time, your Daily Water Requirement 30 minutes after that, hydration reminders when you have not logged water for a while, alerts when conditions change, and a Good Night message before bed.',
        'Nothing is sent during your sleep hours. The bell at the top of the dashboard lists what has been delivered.',
        'A reminder can be answered from the notification itself: log the suggested amount, or snooze it.',
      ],
    },
    {
      heading: 'Wearable Battery',
      body: [
        'The battery figure on the dashboard is your wearable’s battery, not your phone’s. It turns red at 20% or below. It shows “--%” when the wearable has not reported a level.',
        'Charge the wearable when it is low: readings stop when it runs out, and the score can no longer use live data.',
      ],
    },
    {
      heading: 'Basic Troubleshooting',
      body: [
        '• No reminders: check that notifications are allowed for GetVari, that alarms and reminders are permitted, and that battery saving is not restricting the app. A banner appears on the dashboard when notifications are off.',
        '• Readings show “--”: make sure Bluetooth is on, the wearable is charged and nearby, then reopen the app.',
        '• Dashboard will not load: check your internet connection and tap Retry.',
        '• A number looks wrong: check your profile in Account — weight, activity level, city and sleep times all affect the target.',
        '• The assistant does not answer: it needs an internet connection and can take a moment to respond; try again shortly.',
      ],
    },
  ],
};

export const INFO_DOCUMENTS: Record<InfoTopic, InfoDocument> = {
  about: ABOUT,
  terms: TERMS,
  privacy: PRIVACY,
  help: HELP,
};

export default INFO_DOCUMENTS;
