import { Router } from "express";
import { loginHandler } from "./auth.controller";

const authRoutes = Router();
authRoutes.post("/login", loginHandler);

export { authRoutes };
