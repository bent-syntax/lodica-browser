-keep class org.mozilla.geckoview.** { *; }
-keep class net.zetetic.database.** { *; }
-dontwarn org.mozilla.**

# kotlinx.serialization: keep generated serializers for persisted tab snapshots.
-keepattributes *Annotation*, InnerClasses
-keep,includedescriptorclasses class be.syntaxya.lodica.**$$serializer { *; }
-keepclassmembers class be.syntaxya.lodica.** { *** Companion; kotlinx.serialization.KSerializer serializer(...); }

# apksig (web-app wrapper signing) references desktop-only JDK classes it never uses on Android.
-keep class com.android.apksig.** { *; }
-dontwarn com.android.apksig.**

# Shizuku: SilentInstall calls the private Shizuku.newProcess reflectively.
-keep class rikka.shizuku.** { *; }
-keep class moe.shizuku.** { *; }
