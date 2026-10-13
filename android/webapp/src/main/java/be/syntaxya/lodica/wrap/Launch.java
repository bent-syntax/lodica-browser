package be.syntaxya.lodica.wrap;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

/** Launcher entry of a web app: hands the site URL to Lodica's web-app mode and closes. */
public class Launch extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            ApplicationInfo ai = getPackageManager().getApplicationInfo(getPackageName(), PackageManager.GET_META_DATA);
            String url = ai.metaData.getString("lodica.url");
            String host = ai.metaData.getString("lodica.host");
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("lodica-webapp://" + getPackageName()))
                .setClassName(host, "be.syntaxya.lodica.ui.WebAppActivity")
                .putExtra("url", url)
                .putExtra("pkg", getPackageName())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NEW_DOCUMENT);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "Install Lodica to open this app", Toast.LENGTH_LONG).show();
        }
        finish();
    }
}
