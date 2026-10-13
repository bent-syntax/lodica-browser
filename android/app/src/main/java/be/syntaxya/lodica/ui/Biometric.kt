package be.syntaxya.lodica.ui

import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

/** Biometric or screen-lock check shared by the password vault and private tabs. */
object Biometric {
    private val Authenticators =
        if (Build.VERSION.SDK_INT >= 30) BIOMETRIC_STRONG or DEVICE_CREDENTIAL else BIOMETRIC_WEAK or DEVICE_CREDENTIAL

    /** False when the phone has no screen lock, so there is nothing to check against. */
    fun available(act: FragmentActivity) =
        BiometricManager.from(act).canAuthenticate(Authenticators) == BiometricManager.BIOMETRIC_SUCCESS

    fun unlock(act: FragmentActivity, title: String, onOk: () -> Unit, onError: (String) -> Unit = {}) {
        val prompt = BiometricPrompt(act, ContextCompat.getMainExecutor(act), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = onOk()
            override fun onAuthenticationError(code: Int, msg: CharSequence) = onError(msg.toString())
        })
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle("Confirm it's you")
                .setAllowedAuthenticators(Authenticators)
                .build()
        )
    }
}
