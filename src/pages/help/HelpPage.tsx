import { useEffect, useId } from 'react'
import { BrandLockup, BRAND_NAME } from '../../brand'
import { AppHeader, joinPath } from '../../shell'
import { Button } from '../../ui/Button'
import '../../brick/landing/landing.css'

/*
 * /help: the questions, how-tos, teacher details and privacy summary that used to fill the bottom of the landing
 * page. Plain reading, same look as the landing page. `/privacy` arrives here at #privacy (src/routes.ts).
 */

const FAQ = [
  {
    question: 'Do students need to know how to code?',
    answer: 'No. Everything works without opening the code: build, press Play, share. In the Hackable Platformer every brick\'s code is there to open when they want it, in blocks like Scratch, and each script can be switched off to see what it does.',
  },
  {
    question: 'Do I need an account?',
    answer: 'No. Start building right away as a guest; your draft is saved in this browser. Accounts are for classes: students join with a code from their teacher, then sign in to save worlds online and open class worlds.',
  },
  {
    question: 'Where is my work saved?',
    answer: 'Guest builds are saved in this browser on this device, and you can export a copy at any time. When you sign in to a class account, the worlds you save go to your account so you can open them on another device. Guest rooms you share by link are temporary: a room expires about two hours after the last activity.',
  },
  {
    question: 'Can we build together?',
    answer: 'Yes. As a guest, choose Build together to create a room and copy its invite link; anyone with the link can join while the room is open to new people. In a class, the teacher creates class and group worlds that students find in My Class, no link needed. A teacher can pause building together at any time; the work is kept.',
  },
] as const

export function HelpPage() {
  const faqId = useId()
  const howId = useId()
  const teachersId = useId()
  const privacyId = useId()

  // The page is a lazy chunk, so /help#privacy arrives before its target exists.
  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) return
    let target: HTMLElement | null = null
    try { target = document.getElementById(decodeURIComponent(hash)) } catch { target = null }
    target?.scrollIntoView({ block: 'start' })
  }, [])

  return (
    <div className="brick-landing">
      <AppHeader variant="page" title="Help" actions={<Button href="/" variant="secondary" size="sm">Home</Button>} />
      <main className="landing-help">
        <h1>Help</h1>

        <section id="faq" aria-labelledby={faqId}>
          <h2 id={faqId}>Questions</h2>
          <div className="landing-faq-list">
            {FAQ.map((item) => (
              <details key={item.question} className="landing-faq-item">
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="how" aria-labelledby={howId}>
          <h2 id={howId}>How it works</h2>
          <dl>
            <dt>Building</dt>
            <dd>Pick a brick from the drawer and tap or click the plate to place it. Undo and redo sit in the toolbar. Explore switches to your character; walk and jump with the keyboard, or with touch controls on phones and tablets.</dd>
            <dt>Platformers and race tracks</dt>
            <dd>Choose New project, then Platformer or Race track. Pick bricks from the Bricks drawer and tap or click to place them, then press Play to run or race through what you made. Signed-in students find every project in My projects and share it with the class the same way.</dd>
            <dt>Hackable Platformer</dt>
            <dd>Choose New project, then Hackable Platformer. Build and Play work like a platformer; Code shows the blocks inside the brick you picked. Switch a script off to see what it does, or tap + Power to snap one on. Hackable projects save like other projects.</dd>
            <dt>Hackable Racing</dt>
            <dd>Choose New project, then Hackable Racing. Paint a track, place the Finish line and the Starter, and race your Car against computer racers. Every brick has code inside, just like the Hackable Platformer: open the Car to change how it drives.</dd>
            <dt>Playing a Hackable game together</dt>
            <dd>Open the ⋯ menu (This project) and choose Play together, or invite classmates from My projects. Everyone gets their own Hero or Car in the same game. Only the owner changes the project, and their changes reach everyone as they make them. Restart starts everyone again; Room lets the owner remove a player or close the room to new players.</dd>
            <dt>Saving</dt>
            <dd>Signed-in students save to their account as they build, and every project is in My projects. Without an account, projects stay on this computer. Any project can be downloaded as a .brickgineers file and imported again later.</dd>
            <dt>Sharing</dt>
            <dd>Build together creates a temporary room with an invite link you can copy. Anyone with the link can join while the room is open to new people; the owner can close it. Rooms expire about two hours after the last activity, so export a copy to keep the build.</dd>
            <dt>Students</dt>
            <dd>Join a class with your enrollment code and choose a username and password. Returning students sign in with their class code, username and password. Forgot your password? Ask your teacher for a temporary one.</dd>
          </dl>
        </section>

        <section id="teachers" aria-labelledby={teachersId}>
          <h2 id={teachersId}>For teachers</h2>
          <dl>
            <dt>Getting started</dt>
            <dd>Sign in with your teacher account, create a class, and give students its enrollment code. Students choose a username and password; no student email address is needed. Continue with your teacher Google account, or use email and password.</dd>
            <dt>Controls you run</dt>
            <dd>Close joining, pause building together, set a temporary password, suspend or reactivate a student, and restore an earlier checkpoint of a shared world.</dd>
            <dt>How shared worlds work</dt>
            <dd>Create a whole-class or group world from any build. Students find it in My Class and join; no invite link is needed, and a student who was removed from a group cannot rejoin by link. Shared worlds stay open only while building together is on. Pause it whenever you like with Pause building at the top of My class: students can no longer open shared worlds, their contributions are kept, and you can still review the world. Resume building opens them again.</dd>
            <dt>The class shelf</dt>
            <dd>A student who builds a new power can share it on the class shelf. You check it first; the shelf shows who made it and how many classmates use it.</dd>
          </dl>
          <p className="landing-cta-row landing-cta-row-compact">
            <Button href={joinPath({ mode: 'teacher' })} variant="primary">Teacher sign in</Button>
          </p>
        </section>

        <section id="privacy" aria-labelledby={privacyId}>
          <h2 id={privacyId}>Privacy</h2>
          <p className="landing-fineprint-note">A plain summary of how the app handles your work today. It is not a full privacy policy.</p>
          <ul>
            <li>Guest building stores your draft, settings, and character choices in this browser only. Clearing site data removes them.</li>
            <li>A shared guest room keeps the build and builder names on the server while the room is active, and deletes them about two hours after the last activity.</li>
            <li>A class account stores a username, a roster name that only you and your teacher see, protected sign-in credentials, and the worlds you save. Students never need an email address.</li>
            <li>Teacher sign-in uses your existing teacher account. Google sign-in confirms your existing teacher account.</li>
            <li>Vercel hosts the app, Cloudflare runs shared rooms, and Supabase handles accounts. Fonts are loaded from Google Fonts.</li>
            <li>Questions about a class account go to the teacher. Teachers reach the team that set up their account.</li>
          </ul>
        </section>
      </main>
      <footer className="landing-footer">
        <BrandLockup size={24} className="landing-brand landing-brand-footer" />
        <p>
          {BRAND_NAME} is an independent creation and is not affiliated with or endorsed by the LEGO Group.
        </p>
      </footer>
    </div>
  )
}

export default HelpPage
