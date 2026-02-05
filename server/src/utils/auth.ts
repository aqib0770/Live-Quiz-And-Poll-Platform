import crypto from "crypto";
import { google } from "googleapis";

const generateState = () => {
  return crypto.randomBytes(32).toString("hex");
};
const generateNonce = () => {
  return crypto.randomBytes(32).toString("hex");
};

const generateAuthUrl = (state: string) => {
  const oauthClient = new google.auth.OAuth2({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uris: process.env.GOOGLE_REDIRECT_URI
      ? [process.env.GOOGLE_REDIRECT_URI]
      : undefined,
  });

  const scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid",
  ];

  const authUrl = oauthClient.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    state: state,
    prompt: "consent",
  });
  return authUrl;
};
export { generateState, generateNonce, generateAuthUrl };
