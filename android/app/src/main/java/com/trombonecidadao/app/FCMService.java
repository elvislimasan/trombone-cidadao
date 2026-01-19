package com.trombonecidadao.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Map;

public class FCMService extends FirebaseMessagingService {
    private static final String TAG = "FCMService";
    private static final String CHANNEL_ID = "trombone_cidadao_notifications";
    private static final String ACTION_PUSH_NOTIFICATION = "com.trombonecidadao.app.PUSH_NOTIFICATION";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Log.d(TAG, "🔔 [FCM] onMessageReceived chamado - From: " + remoteMessage.getFrom());

        // Verificar se a mensagem contém dados
        if (remoteMessage.getData().size() > 0) {
            Log.d(TAG, "🔔 [FCM] Message data payload: " + remoteMessage.getData());
        }

        // Verificar se a mensagem contém notificação
        if (remoteMessage.getNotification() != null) {
            Log.d(TAG, "🔔 [FCM] Message Notification Body: " + remoteMessage.getNotification().getBody());
        }

        // ✅ IMPORTANTE: Passar notificação para o Capacitor quando app está em FOREGROUND
        // O Capacitor Push Notifications plugin gerencia automaticamente quando o app está em background
        // Quando está em foreground, precisamos enviar via Intent para a MainActivity
        try {
            // Criar objeto JSON com os dados da notificação
            JSONObject notificationData = new JSONObject();
            
            // Adicionar dados da notificação (title e body)
            if (remoteMessage.getNotification() != null) {
                notificationData.put("title", remoteMessage.getNotification().getTitle() != null ? remoteMessage.getNotification().getTitle() : "");
                notificationData.put("body", remoteMessage.getNotification().getBody() != null ? remoteMessage.getNotification().getBody() : "");
            }
            
            // Adicionar dados extras
            JSONObject data = new JSONObject();
            for (Map.Entry<String, String> entry : remoteMessage.getData().entrySet()) {
                data.put(entry.getKey(), entry.getValue());
            }
            notificationData.put("data", data);
            
            // Adicionar ID da notificação
            notificationData.put("id", remoteMessage.getMessageId() != null ? remoteMessage.getMessageId() : String.valueOf(System.currentTimeMillis()));
            
            Log.d(TAG, "🔔 [FCM] Enviando notificação para Capacitor: " + notificationData.toString());
            
            // Enviar Intent para a MainActivity que vai passar para o JavaScript
            Intent intent = new Intent(ACTION_PUSH_NOTIFICATION);
            intent.putExtra("notification", notificationData.toString());
            intent.setPackage(getPackageName());
            sendBroadcast(intent);
            
            Log.d(TAG, "✅ [FCM] Intent enviado para MainActivity via Broadcast");
            
        } catch (JSONException e) {
            Log.e(TAG, "❌ [FCM] Erro ao criar JSON da notificação: " + e.getMessage(), e);
        }
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "Refreshed token: " + token);
        // O Capacitor Push Notifications plugin gerencia automaticamente o token
        // O token será enviado para o JavaScript via listener 'registration'
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Trombone Cidadão",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Notificações do Trombone Cidadão");
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }
}

