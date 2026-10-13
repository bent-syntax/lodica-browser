package be.syntaxya.lodica.ui

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.fragment.app.FragmentActivity
import java.io.File

/**
 * Answers page requests for files, Android permissions and sharing. The activity in front owns [Prompts.host].
 * FragmentActivity (not plain ComponentActivity) because BiometricPrompt needs one.
 */
abstract class HostActivity : FragmentActivity(), PromptHost {

    private var filesDone: ((Array<Uri>?) -> Unit)? = null
    private var permsDone: ((Boolean) -> Unit)? = null
    private var captureUri: Uri? = null

    private val pickOne = registerForActivityResult(ActivityResultContracts.OpenDocument()) { u ->
        filesDone?.invoke(u?.let { arrayOf(it) }); filesDone = null
    }
    private val pickMany = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { us ->
        filesDone?.invoke(us.takeIf { it.isNotEmpty() }?.toTypedArray()); filesDone = null
    }
    private val takePhoto = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        filesDone?.invoke(if (ok) captureUri?.let { arrayOf(it) } else null); filesDone = null
    }
    private val perms = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { res ->
        permsDone?.invoke(res.isNotEmpty() && res.values.all { it }); permsDone = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Prompts.host = this
    }

    override fun onResume() {
        super.onResume()
        Prompts.host = this
    }

    override fun onDestroy() {
        if (Prompts.host === this) Prompts.host = null
        super.onDestroy()
    }

    override fun pickFiles(mimeTypes: Array<String>, multiple: Boolean, capture: Boolean, done: (Array<Uri>?) -> Unit) {
        filesDone?.invoke(null)
        filesDone = done
        val types = mimeTypes.filter { it.contains('/') }.ifEmpty { listOf("*/*") }.toTypedArray()
        try {
            if (capture && types.all { it.startsWith("image/") } &&
                ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
            ) {
                val dir = File(cacheDir, "capture").apply { mkdirs() }
                val f = File(dir, "photo-${System.currentTimeMillis()}.jpg")
                captureUri = FileProvider.getUriForFile(this, "$packageName.files", f)
                takePhoto.launch(captureUri!!)
            } else if (multiple) pickMany.launch(types) else pickOne.launch(types)
        } catch (_: ActivityNotFoundException) {
            filesDone?.invoke(null); filesDone = null
        }
    }

    override fun requestAndroid(permissions: Array<String>, done: (Boolean) -> Unit) {
        val missing = permissions.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) return done(true)
        permsDone?.invoke(false)
        permsDone = done
        perms.launch(missing.toTypedArray())
    }

    override fun share(title: String?, text: String?, uri: String?): Boolean {
        val body = listOfNotNull(text?.takeIf { it.isNotBlank() }, uri).joinToString("\n")
        if (body.isEmpty()) return false
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, body)
            title?.let { putExtra(Intent.EXTRA_SUBJECT, it) }
        }
        return runCatching { startActivity(Intent.createChooser(send, title)) }.isSuccess
    }
}
