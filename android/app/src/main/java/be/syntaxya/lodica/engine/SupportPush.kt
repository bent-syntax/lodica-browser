package be.syntaxya.lodica.engine

import android.content.Context
import be.syntaxya.lodica.BuildConfig
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

/** Instant support alerts over FCM. Off (polling only) unless keystore/fcm.properties was present at build time. */
class SupportPush : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        Thread { send(applicationContext, token) }.start()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Data message from the relay: pull the ticket and show the notification. Runs on FCM's worker thread.
        runCatching { Support.refresh(applicationContext, notify = true) }
    }

    companion object {
        private fun configured() = BuildConfig.FCM_APP_ID.isNotBlank() && BuildConfig.FCM_API_KEY.isNotBlank() && BuildConfig.FCM_PROJECT_ID.isNotBlank()

        private fun ensure(ctx: Context): Boolean {
            if (!configured()) return false
            if (FirebaseApp.getApps(ctx).isEmpty()) FirebaseApp.initializeApp(ctx, FirebaseOptions.Builder()
                .setApplicationId(BuildConfig.FCM_APP_ID).setApiKey(BuildConfig.FCM_API_KEY)
                .setProjectId(BuildConfig.FCM_PROJECT_ID).setGcmSenderId(BuildConfig.FCM_SENDER_ID).build())
            return true
        }

        /** Fetches this device's token and tells the relay which ticket to alert. Safe to call repeatedly. */
        fun register(ctx: Context) {
            val app = ctx.applicationContext
            if (Support.ticketId(app) == null || !runCatching { ensure(app) }.getOrDefault(false)) return
            runCatching { FirebaseMessaging.getInstance().token.addOnSuccessListener { t -> Thread { send(app, t) }.start() } }
        }

        private fun send(ctx: Context, token: String) {
            val id = Support.ticketId(ctx) ?: return
            Relay.init(ctx)
            if (!Relay.available) return
            runCatching { Relay.request("POST", "/api/support/$id/push", JSONObject().put("token", token).toString().toByteArray(), "application/json") }
        }
    }
}
