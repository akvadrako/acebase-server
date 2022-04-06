import { RouteInitEnvironment, RouteRequest } from './shared/env';
import { DbUserAccountDetails } from './schema/user';
import { parseSignedPublicToken } from './shared/tokens';
import { sendBadRequestError, sendUnexpectedError } from './shared/error';
import { createPasswordHash } from './shared/password';
import { AceBaseUserResetPasswordSuccessEmailRequest } from './shared/email';

export class ResetPasswordError extends Error { 
    constructor(public code: 'invalid_code'|'unknown_user'|'password_requirement_mismatch', message: string) {
        super(message);
    }
}

export type RequestQuery = {};
export type RequestBody = { code: string; password: string };
export type ResponseBody = 'OK' | { code: string; message: string };
export type Request = RouteRequest<any, ResponseBody, RequestBody, RequestQuery>;

/**
 * Adds the reset_password route and returns the reset function that can be used to manually reset a password
 * @param env environment
 * @returns returns the reset function
 */
export const addRoute = (env: RouteInitEnvironment) => {

    const resetPassword = async (clientIp: string, code: string, newPassword: string) => {
        try {
            var verification = parseSignedPublicToken(code, env.tokenSalt);
        }
        catch(err) {
            throw new ResetPasswordError('invalid_code', err.message);
        }
        const snap = await env.authRef.child(verification.uid).get();
        if (!snap.exists()) { 
            throw new ResetPasswordError('unknown_user', 'Uknown user');
        }
        const user: DbUserAccountDetails = snap.val();
        user.uid = snap.key as string;

        if (user.password_reset_code !== verification.code) { 
            throw new ResetPasswordError('invalid_code', 'Invalid code');
        }
        if (newPassword.length < 8 || newPassword.includes(' ')) {
            throw new ResetPasswordError('password_requirement_mismatch', 'Password must be at least 8 characters, and cannot contain spaces');
        }
        
        // Ok to change password
        const pwd = createPasswordHash(newPassword);                        
        await snap.ref.update({ 
            password: pwd.hash, 
            password_salt: pwd.salt, 
            password_reset_code: null 
        })
        // Send confirmation email
        const request: AceBaseUserResetPasswordSuccessEmailRequest = {
            type: 'user_reset_password_success',
            date: new Date(),
            ip: clientIp,
            user: {
                uid: user.uid,
                email: user.email,
                username: user.username,
                displayName: user.display_name,
                settings: user.settings
            }
        };
        env.config.email?.send(request);
        return user;
    };

    env.app.post(`/auth/${env.db.name}/reset_password`, async (req: Request, res) => {

        const details = req.body;
        try {
            const user = await resetPassword(req.ip, details.code, details.password);
            env.logRef.push({ action: 'reset_password', success: true, ip: req.ip, date: new Date(), uid: user.uid });
            res.send('OK');
        }
        catch (err) {
            env.logRef.push({ action: 'reset_password', success: false, code: err.code, message: err.message, ip: req.ip, date: new Date(), uid: req.user?.uid ?? null });
            if (err.code) {
                sendBadRequestError(res, err);
            }
            else {
                sendUnexpectedError(res, err);
            }
        }
    });

    return resetPassword;
};

export default addRoute;