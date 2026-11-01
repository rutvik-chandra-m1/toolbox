package app.toolbox.personal;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.WindowManager;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Puts finished files in the phone's Downloads/Toolbox folder and opens or shares them. Used through
 * src/shared/files (never directly by a tool). Android 10+ goes through MediaStore, which needs no
 * permission and renames to "name (1).pdf" when the name is taken, so nothing is ever overwritten.
 */
@CapacitorPlugin(
    name = "ToolboxFiles",
    permissions = @Permission(alias = ToolboxFilesPlugin.STORAGE, strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
)
public class ToolboxFilesPlugin extends Plugin {
    static final String STORAGE = "storage";
    private static final String FOLDER = "Toolbox";

    @PluginMethod
    public void publish(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState(STORAGE) != PermissionState.GRANTED) {
            requestPermissionForAlias(STORAGE, call, "storagePermissionAnswered");
        } else {
            publishInBackground(call);
        }
    }

    @PermissionCallback
    private void storagePermissionAnswered(PluginCall call) {
        if (getPermissionState(STORAGE) == PermissionState.GRANTED) publishInBackground(call);
        else call.reject("Storage permission was refused.");
    }

    private void publishInBackground(PluginCall call) {
        getBridge().execute(() -> {
            File source = new File(Uri.parse(call.getString("uri", "")).getPath());
            String name = call.getString("name");
            try {
                JSObject result = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? publishToMediaStore(source, name, call.getString("mimeType"))
                    : publishToFolder(source, name);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Could not save to Downloads: " + e.getMessage());
            }
        });
    }

    private JSObject publishToMediaStore(File source, String name, String mimeType) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, name);
        values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER);
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("MediaStore refused the file.");
        try (InputStream in = new FileInputStream(source); OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IOException("Could not open the new file.");
            copy(in, out);
        } catch (IOException e) {
            resolver.delete(uri, null, null);
            throw e;
        }
        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        resolver.update(uri, values, null, null);

        return result(uri.toString(), displayName(resolver, uri, name));
    }

    /** MediaStore may have renamed the file to keep it unique. */
    private String displayName(ContentResolver resolver, Uri uri, String fallback) {
        try (Cursor cursor = resolver.query(uri, new String[] { MediaStore.Downloads.DISPLAY_NAME }, null, null, null)) {
            return cursor != null && cursor.moveToFirst() ? cursor.getString(0) : fallback;
        }
    }

    /** Android 9 and older have no MediaStore Downloads; write to the folder itself. */
    private JSObject publishToFolder(File source, String name) throws IOException {
        File folder = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER);
        if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("Could not create the Toolbox folder.");

        File target = new File(folder, name);
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String extension = dot > 0 ? name.substring(dot) : "";
        for (int n = 1; target.exists(); n++) target = new File(folder, base + " (" + n + ")" + extension);

        try (InputStream in = new FileInputStream(source); OutputStream out = new FileOutputStream(target)) {
            copy(in, out);
        }
        return result(Uri.fromFile(target).toString(), target.getName());
    }

    private void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[1024 * 1024];
        for (int read = in.read(buffer); read != -1; read = in.read(buffer)) out.write(buffer, 0, read);
    }

    private JSObject result(String uri, String name) {
        JSObject result = new JSObject();
        result.put("uri", uri);
        result.put("name", name);
        return result;
    }

    @PluginMethod
    public void open(PluginCall call) {
        Uri uri = readableUri(call.getString("uri", ""));
        Intent intent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, call.getString("mimeType"))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No app on this phone can open this file.");
        }
    }

    @PluginMethod
    public void share(PluginCall call) {
        Uri uri = readableUri(call.getString("uri", ""));
        Intent intent = new Intent(Intent.ACTION_SEND)
            .setType(call.getString("mimeType"))
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.setClipData(ClipData.newRawUri(call.getString("title"), uri));
        getActivity().startActivity(Intent.createChooser(intent, call.getString("title")));
        call.resolve();
    }

    /** Other apps cannot read a file:// path; FileProvider turns it into a content:// link they can. */
    private Uri readableUri(String uri) {
        Uri parsed = Uri.parse(uri);
        if (!"file".equals(parsed.getScheme())) return parsed;
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", new File(parsed.getPath()));
    }

    @PluginMethod
    public void keepScreenOn(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }
}
