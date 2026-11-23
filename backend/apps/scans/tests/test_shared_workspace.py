from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import UserProfile
from apps.scans.allowlist import is_value_allowed
from apps.scans.models import AllowlistEntry, ScanRun, Target


def make_user(name: str, role: str) -> User:
    user = User.objects.create_user(username=name, password="x")
    UserProfile.objects.create(user=user, role=role)
    return user


class SharedWorkspaceTests(TestCase):
    def setUp(self):
        self.admin = make_user("admin1", UserProfile.Role.ADMIN)
        self.operator = make_user("op1", UserProfile.Role.OPERATOR)
        self.analyst = make_user("an1", UserProfile.Role.ANALYST)
        self.client = APIClient()

    def test_allowlist_added_by_admin_binds_operator(self):
        AllowlistEntry.objects.create(owner=self.admin, value="10.0.0.0/8", entry_type="cidr")
        self.assertTrue(is_value_allowed(self.operator, "10.1.2.3", "ip"))
        self.assertFalse(is_value_allowed(self.operator, "8.8.8.8", "ip"))

        self.client.force_login(self.operator)
        response = self.client.post(reverse("target-list"), {"address": "8.8.8.8", "type": "ip"}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post(reverse("target-list"), {"address": "10.9.9.9", "type": "ip"}, format="json")
        self.assertEqual(response.status_code, 201)

    def test_everyone_sees_the_same_allowlist(self):
        AllowlistEntry.objects.create(owner=self.admin, value="lab.example.test", entry_type="domain")
        self.client.force_login(self.analyst)
        body = self.client.get(reverse("allowlist-list")).json()
        self.assertTrue(body["enforced"])
        self.assertEqual([item["value"] for item in body["results"]], ["lab.example.test"])

    def test_duplicate_target_across_users_rejected(self):
        Target.objects.create(owner=self.admin, address="10.0.0.5", target_type="ip")
        self.client.force_login(self.operator)
        response = self.client.post(reverse("target-list"), {"address": "10.0.0.5", "type": "ip"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_override_is_shared_between_analysts(self):
        other = make_user("an2", UserProfile.Role.ANALYST)
        from apps.scans.overrides import overrides_for_keys
        from apps.scans.serializers import ManualOverrideSerializer
        from rest_framework.test import APIRequestFactory

        request = APIRequestFactory().post("/")
        request.user = self.analyst
        serializer = ManualOverrideSerializer(
            data={"entity_key": "port:10.0.0.5:tcp/22", "tags": ["vpn-only"]}, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        self.assertIn("port:10.0.0.5:tcp/22", overrides_for_keys(other, ["port:10.0.0.5:tcp/22"]))

    def test_viewer_sees_teammates_scans(self):
        viewer = make_user("v1", UserProfile.Role.VIEWER)
        run = ScanRun.objects.create(owner=self.operator, modules_snapshot=[])
        self.client.force_login(viewer)
        ids = [item["id"] for item in self.client.get(reverse("scan-list")).json()]
        self.assertIn(run.id, ids)
