import jwksClient from "jwks-rsa";
import catchAsync from "../utils/catchAsync";
import jwt from "jsonwebtoken";
import type { CookieOptions, NextFunction, Request, Response } from "express";
import { generateAuthUrl, generateNonce, generateState } from "../utils/auth";
import AppError from "../utils/AppError";
import axios from "axios";
import { users } from "../db/schema";
import db from "../config/db.config";
import { eq } from "drizzle-orm";

const client = jwksClient({
  jwksUri: process.env.GOOGLE_JWKS_URI!,
  cache: true,
  rateLimit: true,
});

const getSigningKey = async (kid: string) => {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        console.error("Error fetching signing key:", err);
        return reject(err);
      }
      const signingKey = key?.getPublicKey();
      resolve(signingKey);
    });
  });
};

const verifyGoogleToken = async (token: string) => {
  try {
    const decodedHeader: any = jwt.decode(token, { complete: true });
    if (!decodedHeader || !decodedHeader.header) {
      throw new Error("Invalid token");
    }
    const kid = decodedHeader.header.kid;
    const signingKey: any = await getSigningKey(kid);
    const verifiedToken = jwt.verify(token, signingKey, {
      algorithms: ["RS256"],
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    return verifiedToken;
  } catch (error) {
    throw new Error(
      "Token verification failed",
      error instanceof Error ? error : undefined,
    );
  }
};

const googleLogin = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const state = generateState();
    const nonce = generateNonce();

    const cookieOptions = <CookieOptions>{
      httpOnly: true,
      maxAge: 10 * 60 * 1000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    };

    res.cookie("auth_state", state, cookieOptions);
    res.cookie("auth_nonce", nonce, cookieOptions);

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.GOOGLE_REDIRECT_URI}&response_type=code&scope=email%20profile%20openid&state=${state}&nonce=${nonce}&access_type=offline`;
    res.redirect(googleAuthUrl);
  },
);

const googleCallback = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { code, state } = req.query;
    const savedState = req.cookies.auth_state;
    res.clearCookie("auth_state").clearCookie("auth_nonce");

    if (!code || !state || state !== savedState) {
      return next(new AppError("Invalid state or code", 400));
    }
    if (!savedState) {
      return next(new AppError("Missing state cookie", 400));
    }
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      {
        code: code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      },
    );
    if (tokenResponse.status !== 200) {
      return next(new AppError("Failed to exchange code for tokens", 400));
    }
    const { id_token } = tokenResponse.data;
    if (!id_token) {
      return next(new AppError("ID token not found in response", 400));
    }
    const decodedToken: any = await verifyGoogleToken(id_token);
    if (!decodedToken) {
      return next(new AppError("Failed to verify ID token", 400));
    }
    if (decodedToken.nonce !== req.cookies.auth_nonce) {
      return next(new AppError("Invalid nonce", 400));
    }
    const user = await db.query.users.findFirst({
      where: eq(users.email, decodedToken.email),
    });
    if (!user) {
      await db.insert(users).values({
        name: decodedToken.name,
        email: decodedToken.email,
      });
    }
    const accessToken = jwt.sign(
      { email: decodedToken.email },
      process.env.JWT_SECRET!,
      { expiresIn: "1h" },
    );
    res
      .cookie("jwt", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 1000,
        sameSite: "lax",
      })
      .status(200)
      .json({
        message: "Authentication successful",
      });
    // .redirect(process.env.FRONTEND_URL!);
  },
);

export { googleLogin, googleCallback };
