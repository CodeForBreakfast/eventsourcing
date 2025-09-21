# GitHub App Setup for Verified Release Commits

This guide explains how to set up a GitHub App for creating verified commits in the changesets release workflow.

## Why Use a GitHub App?

Using a GitHub App token with the changesets action's `commitMode: "github-api"` option creates automatically verified commits. When commits are made through the GitHub API (rather than git CLI), they're GPG-signed by GitHub and attributed to your app.

## Setup Steps

### 1. Create a GitHub App

1. Go to your GitHub organization settings (or personal settings for personal repos)
2. Navigate to **Developer settings** → **GitHub Apps**
3. Click **New GitHub App**
4. Configure the app with these settings:

   **Basic Information:**
   - **GitHub App name**: `[YourOrg] Release Bot` (or similar)
   - **Homepage URL**: Your repository URL
   - **Description**: "Automated release management for changesets"

   **Permissions:**
   - **Repository permissions:**
     - **Contents**: Read & Write (for creating commits)
     - **Pull requests**: Read & Write (for creating PRs)
     - **Metadata**: Read (always required)

   **Where can this GitHub App be installed?**
   - Select "Only on this account"

5. Click **Create GitHub App**

### 2. Generate Private Key

1. After creating the app, scroll down to **Private keys**
2. Click **Generate a private key**
3. Save the downloaded `.pem` file securely

### 3. Install the App

1. In your GitHub App settings, click **Install App**
2. Select your organization/account
3. Choose "Only select repositories" and select your repository
4. Click **Install**

### 4. Configure Repository Secrets

Add these secrets to your repository:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add the following secrets:
   - **`RELEASE_APP_ID`**: Your GitHub App's ID
     - Find this on your GitHub App's settings page (it's the number, not the name)

   - **`RELEASE_APP_PRIVATE_KEY`**: The entire contents of the `.pem` file
     - Copy the entire private key including the header and footer lines
     - Example format:
       ```
       -----BEGIN RSA PRIVATE KEY-----
       [key content]
       -----END RSA PRIVATE KEY-----
       ```

## How Verification Works

The changesets action with `commitMode: "github-api"` uses the GitHub API instead of git CLI to create commits. This means:

1. All commits are automatically GPG-signed by GitHub
2. Commits are attributed to the app that owns the token
3. No manual GPG/SSH key management is needed
4. Commits show as "Verified" with GitHub's signature

## Verification

After setup, your changesets release PRs will show commits as verified with a green checkmark. The commits will be signed with GitHub's GPG key and attributed to your GitHub App bot user (e.g., `your-app-name[bot]`).

## Troubleshooting

### Permission Errors

- Ensure the GitHub App has both read and write permissions for Contents and Pull Requests
- Verify the app is installed on the correct repository

### Invalid Key Format

- Make sure you're copying the entire private key including the header/footer
- Don't add extra spaces or line breaks

### App Not Found

- Double-check the App ID is correct (it's a number, not the app name)
- Ensure the app is installed on the repository

## Security Notes

- Keep the private key secure and never commit it to the repository
- Rotate the private key periodically for security
- Consider using environment-specific apps for different branches/environments
