# Simple guide: get Session 1 running on your PC

**Why:** this chat runs on a cloud computer. It cannot see your PC, your `.env`, or reach Jobber and CompanyCam. Session 1 has to run in Claude on your own PC. Your project files are already saved on GitHub. These steps copy them to your PC and start Claude there.

Time needed: about 15 minutes.

---

## Part 1: Install Git (one time)

Git is the tool that copies the project from GitHub. Claude Code on Windows needs it too.

1. Open Chrome.
2. Go to **git-scm.com/download/win**
3. Click **Click here to download**. A file starting with `Git-` downloads.
4. Open that file. Click **Yes** if Windows asks for permission.
5. Click **Next** on every screen without changing anything. Then click **Install**, then **Finish**.

## Part 2: Copy the project to your PC

6. **Close every PowerShell window** you have open. Old windows can't see the new Git install.
7. Click **Start**, type **PowerShell**, and click **Windows PowerShell**. Do not pick "Run as administrator".
8. Type this and press **Enter**:
   ```
   git --version
   ```
   You should see something like `git version 2.47.0`. If you still see "not recognized", restart the PC and repeat steps 7–8.
9. Copy and paste this line, then press **Enter**:
   ```
   cd C:\SealTech
   ```
10. Copy and paste this line, then press **Enter**:
    ```
    git clone -b claude/new-session-krcih4 https://github.com/Jstimach5/SealTech-Dashboard jobsite-audit
    ```
11. If a window pops up asking you to sign in to GitHub, click **Sign in with your browser**, then **Authorize**.
12. Check that it worked. Open **File Explorer** and go to **C:\SealTech\jobsite-audit**. You should see these files:
    - CLAUDE.md
    - REQUIREMENTS.md
    - SESSION_01.md
    - PROJECT_STATUS.md

## Part 3: Start Claude on your PC

13. Open the **Claude desktop app**.
14. Click **Code** at the top.
15. Choose to work on **your computer** (local), not in the cloud.
16. When it asks for a folder, pick **C:\SealTech\jobsite-audit**.
17. Paste this message and press **Enter**:
    ```
    Read CLAUDE.md, REQUIREMENTS.md, and SESSION_01.md in that order.
    The settings file (.claude/settings.json) and PROJECT_STATUS.md already exist and are approved.
    Project path is C:\SealTech\jobsite-audit (confirmed).
    First check whether the rules in .claude/settings.json also cover PowerShell, and propose fixes if not.
    Then present the step-by-step plan for SESSION_01 steps 1-8, including every point where you need me.
    Wait for my approval before doing anything beyond reading files.
    ```

## Part 4: What happens next

- Claude on your PC will inspect the machine and set up the project.
- It will stop and give you click-by-click instructions when it needs you:
  1. Adding read permissions to your Jobber app and signing in again.
  2. Creating a CompanyCam token.
  3. Looking up a few field names in Jobber's GraphiQL tool.
  4. Trying one screen in Microsoft Entra.
- You'll put tokens into `.env` yourself with Notepad. **Never paste a token into any chat.**

## If something goes wrong

Copy the exact error text and paste it into this chat or the new one. Say which step number you were on.
