
# Peymate React (Frontend only)

ICP project with Frontend and II.

## Deployment Steps

1. Copy .env.sample to .env.development

    ```bash
    cp .env.sample .env.development
    ```

2. Replace the parameter "VITE_BACKEND_CANISTER_ENDPOINT" in .env.development by your local backend canister url

3. Build the project

    ```bash
    npm run build
    ```

4. Make deployment

    ```bash
    dfx deploy
    ```
